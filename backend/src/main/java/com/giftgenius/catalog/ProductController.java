package com.giftgenius.catalog;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.catalog.ProductDtos.CategoryDto;
import com.giftgenius.catalog.ProductDtos.ProductDto;
import com.giftgenius.catalog.ProductService.ProductQuery;
import com.giftgenius.common.PageResponse;

@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductService service;

    public ProductController(ProductService service) {
        this.service = service;
    }

    @GetMapping
    public PageResponse<ProductDto> search(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String tag,
            @RequestParam(required = false) String occasion,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(required = false) String store,
            @RequestParam(defaultValue = "featured") String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "24") int size) {
        return service.search(new ProductQuery(q, category, tag, occasion, minPrice, maxPrice, sort, store), page, size);
    }

    @GetMapping("/categories")
    public List<CategoryDto> categories() {
        return service.categories();
    }

    @GetMapping("/{id}")
    public ProductDto get(@PathVariable Long id) {
        return service.get(id);
    }

    @GetMapping("/{id}/related")
    public List<ProductDto> related(@PathVariable Long id, @RequestParam(defaultValue = "4") int limit) {
        return service.related(id, Math.min(Math.max(limit, 1), 8));
    }
}
