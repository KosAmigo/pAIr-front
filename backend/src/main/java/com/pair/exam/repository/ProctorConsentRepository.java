package com.pair.exam.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.pair.exam.domain.ProctorConsent;

public interface ProctorConsentRepository extends JpaRepository<ProctorConsent, Long> {
}
