package com.giftgenius.seller;

import java.time.Instant;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import com.giftgenius.user.User;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A seller's store. Shares its id with the seller's user account, so products.seller_id is the user id. */
@Entity
@Table(name = "seller_profiles")
@Getter
@Setter
@NoArgsConstructor
public class SellerProfile {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(nullable = false, unique = true)
    private String slug;

    @Column(name = "store_name", nullable = false)
    private String storeName;

    private String description;

    @Column(name = "business_category", nullable = false)
    private String businessCategory;

    @Column(nullable = false)
    private String phone;

    @Column(name = "support_email")
    private String supportEmail;

    @Column(name = "address_line", nullable = false)
    private String addressLine;

    @Column(nullable = false)
    private String city;

    @Column(nullable = false)
    private String state;

    @Column(nullable = false)
    private String pincode;

    @Column(name = "logo_url")
    private String logoUrl;

    @Column(name = "banner_url")
    private String bannerUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SellerStatus status = SellerStatus.PENDING;

    /** Why the store was rejected or suspended; shown to the seller. */
    @Column(name = "status_reason")
    private String statusReason;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Version
    private long version;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public boolean canSell() {
        return status == SellerStatus.APPROVED;
    }
}
