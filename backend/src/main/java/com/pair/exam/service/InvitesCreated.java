package com.pair.exam.service;

import java.util.List;

/** 대상자를 새로 등록했다는 이벤트. 트랜잭션이 커밋된 뒤에 초대 메일을 보낸다. */
public record InvitesCreated(List<Long> participantIds) {}
