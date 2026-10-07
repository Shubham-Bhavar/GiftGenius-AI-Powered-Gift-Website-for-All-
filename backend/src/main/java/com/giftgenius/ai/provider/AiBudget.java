package com.giftgenius.ai.provider;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;

/**
 * The cost safeguard on paid model calls: at most {@code dailyLimit} calls per (UTC) day, and a pause after the
 * provider reports its quota is exhausted, so a burst of traffic can't run up a bill or keep hammering a
 * rate-limited API. Past either, the AI features answer from their rules. In memory, per instance, and on top of the
 * per-client rate limit on /api/ai/**.
 */
final class AiBudget {

    private final int dailyLimit;
    private final Duration cooldown;
    private final Clock clock;
    private LocalDate day;
    private int used;
    private Instant pausedUntil = Instant.MIN;

    AiBudget(int dailyLimit, Duration cooldown, Clock clock) {
        this.dailyLimit = dailyLimit;
        this.cooldown = cooldown;
        this.clock = clock;
    }

    /** Whether a call could be made now, without using one up. */
    synchronized boolean hasRoom() {
        rollOver();
        return used < dailyLimit && !clock.instant().isBefore(pausedUntil);
    }

    /** Uses up one call; false when there is no room. */
    synchronized boolean tryAcquire() {
        if (!hasRoom()) {
            return false;
        }
        used++;
        return true;
    }

    /** The provider said its quota is exhausted: no calls until the cool-down has passed. */
    synchronized void pause() {
        pausedUntil = clock.instant().plus(cooldown);
    }

    private void rollOver() {
        LocalDate today = LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC);
        if (!today.equals(day)) {
            day = today;
            used = 0;
        }
    }
}
