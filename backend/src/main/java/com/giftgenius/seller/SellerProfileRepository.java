package com.giftgenius.seller;

import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SellerProfileRepository extends JpaRepository<SellerProfile, Long> {

    Optional<SellerProfile> findBySlug(String slug);

    boolean existsBySlug(String slug);

    boolean existsByStoreNameIgnoreCase(String storeName);

    boolean existsByStoreNameIgnoreCaseAndUserIdNot(String storeName, Long userId);

    /** Admin list: optional status filter and text search over store name, seller name and email. */
    @Query(value = "select s from SellerProfile s join fetch s.user u "
            + "where (:status is null or s.status = :status) and (:q is null or lower(s.storeName) like :q "
            + "or lower(u.fullName) like :q or lower(u.email) like :q) order by s.createdAt desc",
            countQuery = "select count(s) from SellerProfile s join s.user u "
            + "where (:status is null or s.status = :status) and (:q is null or lower(s.storeName) like :q "
            + "or lower(u.fullName) like :q or lower(u.email) like :q)")
    Page<SellerProfile> search(@Param("status") SellerStatus status, @Param("q") String q, Pageable pageable);

    long countByStatus(SellerStatus status);
}
