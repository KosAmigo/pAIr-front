package com.pair.attempt;

import java.time.Instant;
import java.util.List;

/** 응시 1건의 상태. pilot-data/attempts/{id}/attempt.json */
public record Attempt(
        String id,
        String taskId,
        String provider,
        String model,
        Instant startedAt,
        Instant submittedAt,
        Instant followupsDoneAt,
        Instant firstValidAt,
        Status status,
        List<String> followUpAnswers,
        String error,
        /** 답할 때 보인 후속 질문 문구. 과제의 질문이 나중에 바뀌어도 채점은 응시자가 본 질문으로 한다. */
        List<String> followUpQuestions) {

    public enum Status { SOLVING, FOLLOWUP, SCORING, DONE, ERROR }

    public Attempt withStatus(Status s) {
        return new Attempt(id, taskId, provider, model, startedAt, submittedAt, followupsDoneAt, firstValidAt, s, followUpAnswers, error, followUpQuestions);
    }

    public Attempt withSubmitted(Instant at) {
        return new Attempt(id, taskId, provider, model, startedAt, at, followupsDoneAt, firstValidAt, Status.FOLLOWUP, followUpAnswers, error, followUpQuestions);
    }

    public Attempt withFollowUps(List<String> answers, List<String> questions, Instant at) {
        return new Attempt(id, taskId, provider, model, startedAt, submittedAt, at, firstValidAt, Status.SCORING, answers, error, questions);
    }

    public Attempt withFollowUps(List<String> answers, Instant at) {
        return new Attempt(id, taskId, provider, model, startedAt, submittedAt, at, firstValidAt, Status.SCORING, answers, error, followUpQuestions);
    }

    public Attempt withFirstValid(Instant at) {
        return firstValidAt != null ? this
                : new Attempt(id, taskId, provider, model, startedAt, submittedAt, followupsDoneAt, at, status, followUpAnswers, error, followUpQuestions);
    }

    public Attempt withError(String message) {
        return new Attempt(id, taskId, provider, model, startedAt, submittedAt, followupsDoneAt, firstValidAt, Status.ERROR, followUpAnswers, message, followUpQuestions);
    }
}
