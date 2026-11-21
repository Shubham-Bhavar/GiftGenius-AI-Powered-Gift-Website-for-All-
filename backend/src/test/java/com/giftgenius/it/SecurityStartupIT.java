package com.giftgenius.it;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.security.core.userdetails.UserDetailsService;

/** What the running application must not set up behind the JWT sign-in. */
class SecurityStartupIT extends AbstractIT {

    @Autowired
    private ApplicationContext context;

    /** Spring Boot's default in-memory "user" would log a generated password on every start. */
    @Test
    void noDefaultInMemoryUserIsCreated() {
        assertThat(context.getBeansOfType(UserDetailsService.class)).isEmpty();
    }
}
