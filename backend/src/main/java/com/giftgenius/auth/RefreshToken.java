package com.giftgenius.auth;

import java.time.Instant;

import org.hibernate.annotations.CreationTimestamp;

import com.giftgenius.user.User;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Only the SHA-256 hash of a refresh token is stored; the raw value lives in an httpOnly cookie. */
@Entity
@Table(name = "refresh_tokens")
@Getter
@Setter
@NoArgsConstructor
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    /** Set when this token was revoked because it was exchanged for a new one (not by logout or reuse). */
    @Column(name = "rotated_at")
    private Instant rotatedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public boolean isRevoked() {
        return revokedAt != null;
    }

    /** True if this token was rotated within {@code grace} of {@code now} and may be exchanged once more. */
    public boolean isWithinRotationGrace(Instant now, java.time.Duration grace) {
        return rotatedAt != null && rotatedAt.plus(grace).isAfter(now);
    }

    public boolean isExpired() {
        return expiresAt.isBefore(Instant.now());
    }
}
