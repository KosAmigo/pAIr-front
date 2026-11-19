package com.pair.exam.web;

import java.time.Clock;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.pair.exam.service.ExamEntryService;
import com.pair.exam.service.ProctorService;
import com.pair.exam.web.ExamDtos.ConsentRequest;
import com.pair.exam.web.ExamDtos.EntryInfo;
import com.pair.exam.web.ExamDtos.ProctorEventRequest;
import com.pair.exam.web.ExamDtos.ProctorEventView;
import com.pair.exam.web.ExamDtos.ServerTime;

import jakarta.validation.Valid;

/**
 * 응시자 API. 로그인 대신 초대 토큰(입장 링크)으로 본인을 확인한다.
 * 토큰은 경로에 들어가므로 서버 접근 로그에 토큰이 남지 않게 운영 로그 설정에서 가려야 한다.
 */
@RestController
public class ExamEntryController {

    private final ExamEntryService entry;
    private final ProctorService proctor;
    private final Clock clock;

    public ExamEntryController(ExamEntryService entry, ProctorService proctor, Clock clock) {
        this.entry = entry;
        this.proctor = proctor;
        this.clock = clock;
    }

    /** 서버 시각. 프론트는 (서버 시각 - 내 시각)을 보정값으로 써서 남은 시간을 그린다 */
    @GetMapping("/api/time")
    public ServerTime time() {
        return new ServerTime(clock.instant());
    }

    @GetMapping("/api/entry/{token}")
    public EntryInfo info(@PathVariable String token) {
        return entry.info(token);
    }

    @PostMapping("/api/entry/{token}/consent")
    public EntryInfo consent(@PathVariable String token, @Valid @RequestBody ConsentRequest req) {
        return entry.consent(token, req);
    }

    @PostMapping("/api/entry/{token}/enter")
    public EntryInfo enter(@PathVariable String token) {
        return entry.enter(token);
    }

    @PostMapping("/api/entry/{token}/start")
    public EntryInfo start(@PathVariable String token) {
        return entry.start(token);
    }

    @PostMapping("/api/entry/{token}/submit")
    public EntryInfo submit(@PathVariable String token) {
        return entry.submit(token);
    }

    @PostMapping("/api/entry/{token}/proctor-events")
    @ResponseStatus(HttpStatus.CREATED)
    public ProctorEventView proctorEvent(@PathVariable String token, @Valid @RequestBody ProctorEventRequest req) {
        return proctor.record(token, req);
    }
}
