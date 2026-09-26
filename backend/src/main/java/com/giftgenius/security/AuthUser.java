package com.giftgenius.security;

import com.giftgenius.user.Role;

/** The authenticated principal, rebuilt from the access token on every request. */
public record AuthUser(Long id, String email, Role role) {

    public boolean isAdmin() {
        return role == Role.ADMIN;
    }
}
