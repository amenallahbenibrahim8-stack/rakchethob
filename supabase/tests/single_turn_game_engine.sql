begin;

do $$
declare
  created_room jsonb;
  joined_room jsonb;
  state jsonb;
  action jsonb;
  room_id uuid;
  player_one uuid;
  player_two uuid;
  v_session_id uuid;
  question_id uuid;
  answerer_id uuid;
  asker_id uuid;
  i integer;
begin
  created_room := public.create_room('لاعب أول', repeat('a', 64));
  joined_room := public.join_room(created_room->>'room_code', 'لاعب ثاني', repeat('b', 64));
  room_id := (created_room->>'room_id')::uuid;
  player_one := (created_room->>'player_id')::uuid;
  player_two := (joined_room->>'player_id')::uuid;

  begin
    perform public.join_room(created_room->>'room_code', 'لاعب ثالث', repeat('c', 64));
    raise exception 'test failure: third player was allowed into a full room';
  exception when others then
    if sqlerrm like 'test failure:%' then raise; end if;
  end;

  state := public.get_room_game_state(room_id, player_one, repeat('a', 64));
  if state->>'phase' <> 'LOBBY' or jsonb_array_length(state->'players') <> 2 then
    raise exception 'test failure: room did not enter the two-player lobby';
  end if;

  begin
    perform public.start_room_game(room_id, player_two, repeat('b', 64));
    raise exception 'test failure: player two started the game';
  exception when others then
    if sqlerrm like 'test failure:%' then raise; end if;
  end;

  action := public.start_room_game(room_id, player_one, repeat('a', 64));
  state := public.get_room_game_state(room_id, player_one, repeat('a', 64));
  v_session_id := (state->>'session_id')::uuid;
  question_id := (state->'available_questions'->0->>'id')::uuid;
  if state->>'phase' <> 'PLAYER_A_ASKS' or (state->>'total_rounds')::integer <> 10 then
    raise exception 'test failure: game did not start at player one turn';
  end if;

  begin
    perform public.ask_room_game_question(room_id, player_two, repeat('b', 64), null, 'سؤال خارج الدور');
    raise exception 'test failure: player two asked during player one turn';
  exception when others then
    if sqlerrm like 'test failure:%' then raise; end if;
  end;

  for i in 1..20 loop
    state := public.get_room_game_state(room_id, player_one, repeat('a', 64));
    if (state->>'current_round')::integer <> ((i + 1) / 2)
      or (state->>'current_turn')::integer <> case when i % 2 = 1 then 1 else 2 end then
      raise exception 'test failure: incorrect round or turn at question %', i;
    end if;

    asker_id := (state->>'current_asker_id')::uuid;
    answerer_id := (state->>'current_answerer_id')::uuid;
    if asker_id <> case when i % 2 = 1 then player_one else player_two end
      or answerer_id <> case when i % 2 = 1 then player_two else player_one end then
      raise exception 'test failure: incorrect asker or answerer at question %', i;
    end if;

    if i = 1 then
      action := public.ask_room_game_question(room_id, asker_id, case when asker_id = player_one then repeat('a', 64) else repeat('b', 64) end, question_id, null);
    else
      action := public.ask_room_game_question(
        room_id,
        asker_id,
        case when asker_id = player_one then repeat('a', 64) else repeat('b', 64) end,
        null,
        'سؤال اختبار ' || i
      );
    end if;

    state := public.get_room_game_state(room_id, player_one, repeat('a', 64));
    if state->>'question' is null or state->>'phase' <>
      case when i % 2 = 1 then 'PLAYER_B_ANSWERS' else 'PLAYER_A_ANSWERS' end then
      raise exception 'test failure: question state was not preserved at question %', i;
    end if;

    if i = 1 then
      begin
        perform public.submit_room_game_answer(room_id, asker_id, case when asker_id = player_one then repeat('a', 64) else repeat('b', 64) end, 'wrong player');
        raise exception 'test failure: asker was allowed to answer their own question';
      exception when others then
        if sqlerrm like 'test failure:%' then raise; end if;
      end;
      begin
        perform public.submit_room_game_answer(room_id, answerer_id, case when answerer_id = player_one then repeat('a', 64) else repeat('b', 64) end, '   ');
        raise exception 'test failure: empty answer was accepted';
      exception when others then
        if sqlerrm like 'test failure:%' then raise; end if;
      end;
    end if;

    action := public.submit_room_game_answer(
      room_id,
      answerer_id,
      case when answerer_id = player_one then repeat('a', 64) else repeat('b', 64) end,
      'جواب اختبار ' || i
    );

    if i = 1 then
      begin
        perform public.submit_room_game_answer(room_id, answerer_id, case when answerer_id = player_one then repeat('a', 64) else repeat('b', 64) end, 'جواب مكرر');
        raise exception 'test failure: duplicate answer was accepted';
      exception when others then
        if sqlerrm like 'test failure:%' then raise; end if;
      end;
      begin
        perform public.advance_room_game_turn(room_id, player_one, repeat('a', 64));
        raise exception 'test failure: turn advanced before reveal';
      exception when others then
        if sqlerrm like 'test failure:%' then raise; end if;
      end;
    end if;

    state := public.get_room_game_state(room_id, player_two, repeat('b', 64));
    if state->>'phase' <> 'REVEAL' or jsonb_array_length(state->'answers') <> 0 then
      raise exception 'test failure: answer leaked before reveal at question %', i;
    end if;

    action := public.reveal_room_game_turn(room_id, player_one, repeat('a', 64));
    state := public.get_room_game_state(room_id, player_two, repeat('b', 64));
    if jsonb_array_length(state->'answers') <> 1 then
      raise exception 'test failure: answer was not revealed at question %', i;
    end if;

    if i < 20 then
      action := public.advance_room_game_turn(room_id, player_two, repeat('b', 64));
    end if;
  end loop;

  state := public.get_room_game_state(room_id, player_one, repeat('a', 64));
  if state->>'phase' <> 'FINISHED'
    or (state->'result'->>'rounds')::integer <> 10
    or (state->'result'->>'questions')::integer <> 20
    or (state->'result'->>'answers')::integer <> 20 then
    raise exception 'test failure: final result counts are incorrect';
  end if;
  if (select count(*) from public.game_rounds where session_id = v_session_id) <> 20 then
    raise exception 'test failure: expected exactly twenty turns and no eleventh round';
  end if;
  if (select max(round_number) from public.game_rounds where session_id = v_session_id) <> 10 then
    raise exception 'test failure: an eleventh round was created';
  end if;
end;
$$;

rollback;
