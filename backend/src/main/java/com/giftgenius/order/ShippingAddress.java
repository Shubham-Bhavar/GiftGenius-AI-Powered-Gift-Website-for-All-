package com.giftgenius.order;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Embeddable
@Getter
@Setter
@NoArgsConstructor
public class ShippingAddress {

    @Column(name = "ship_full_name", nullable = false)
    private String fullName;

    @Column(name = "ship_email", nullable = false)
    private String email;

    @Column(name = "ship_phone", nullable = false)
    private String phone;

    @Column(name = "ship_address_line", nullable = false)
    private String addressLine;

    @Column(name = "ship_city", nullable = false)
    private String city;

    @Column(name = "ship_state")
    private String state;

    @Column(name = "ship_pincode", nullable = false)
    private String pincode;
}
