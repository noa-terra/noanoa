// Custom error classes
class ProductNotFoundError extends Error {
  constructor(id) {
    super(`Product with id ${id} not found`);
    this.name = "ProductNotFoundError";
    this.statusCode = 404;
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
  }
}

class ProductsService {
  constructor() {
    this.products = [
      {
        id: 1,
        name: "Laptop",
        price: 999.99,
        category: "Electronics",
        stock: 15,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "active",
      },
      {
        id: 2,
        name: "Coffee Maker",
        price: 49.99,
        category: "Appliances",
        stock: 30,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "active",
      },
    ];
    this.nextId = 3;
  }

  // Validation helpers
  validateName(name) {
    if (!name || typeof name !== "string") {
      throw new ValidationError("Product name must be a non-empty string");
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new ValidationError("Product name cannot be empty");
    }
    if (trimmed.length > 200) {
      throw new ValidationError("Product name cannot exceed 200 characters");
    }
    return trimmed;
  }

  validatePrice(price) {
    const priceNum = Number(price);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      throw new ValidationError("Price must be a positive number");
    }
    return Math.round(priceNum * 100) / 100; // Round to 2 decimal places
  }

  validateStock(stock) {
    const stockNum = Number(stock);
    if (Number.isNaN(stockNum) || stockNum < 0 || !Number.isInteger(stockNum)) {
      throw new ValidationError("Stock must be a non-negative integer");
    }
    return stockNum;
  }

  // Get all products with optional filtering
  getAll(status = null, category = null) {
    let result = [...this.products];
    if (status) {
      result = result.filter((product) => product.status === status);
    }
    if (category) {
      result = result.filter(
        (product) => product.category.toLowerCase() === category.toLowerCase()
      );
    }
    return result;
  }

  // Get product by ID
  getById(id) {
    const productId = Number(id);
    if (Number.isNaN(productId)) {
      throw new ValidationError(`Invalid id: ${id}`);
    }
    const product = this.products.find((product) => product.id === productId);
    if (!product) {
      throw new ProductNotFoundError(productId);
    }
    return product;
  }

  // Create new product with validation
  create(data) {
    const name = this.validateName(data.name);
    const price = this.validatePrice(data.price);
    const category = data.category || "Uncategorized";
    const stock = data.stock !== undefined ? this.validateStock(data.stock) : 0;

    // Check for duplicate name
    const duplicate = this.products.find(
      (product) => product.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      throw new ValidationError(`Product with name "${name}" already exists`);
    }

    const product = {
      id: this.nextId++,
      name,
      price,
      category: category.trim(),
      stock,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "active",
    };

    this.products.push(product);
    return product;
  }

  // Update existing product
  update(id, updates) {
    const product = this.getById(id);

    if (updates.name !== undefined) {
      const name = this.validateName(updates.name);
      // Check for duplicates (excluding current product)
      const duplicate = this.products.find(
        (p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase()
      );
      if (duplicate) {
        throw new ValidationError(`Product with name "${name}" already exists`);
      }
      product.name = name;
    }

    if (updates.price !== undefined) {
      product.price = this.validatePrice(updates.price);
    }

    if (updates.category !== undefined) {
      product.category = updates.category.trim();
    }

    if (updates.stock !== undefined) {
      product.stock = this.validateStock(updates.stock);
    }

    if (updates.status !== undefined) {
      if (!["active", "inactive", "discontinued"].includes(updates.status)) {
        throw new ValidationError(
          `Invalid status. Must be one of: active, inactive, discontinued`
        );
      }
      product.status = updates.status;
    }

    product.updatedAt = new Date().toISOString();
    return product;
  }

  // Delete product (throws error if not found)
  delete(id) {
    const productId = Number(id);
    if (Number.isNaN(productId)) {
      throw new ValidationError(`Invalid id: ${id}`);
    }

    const index = this.products.findIndex((product) => product.id === productId);
    if (index === -1) {
      throw new ProductNotFoundError(productId);
    }

    this.products.splice(index, 1);
    return { success: true, deletedId: productId };
  }

  // Get product statistics
  getStats() {
    const totalValue = this.products.reduce(
      (sum, p) => sum + p.price * p.stock,
      0
    );
    return {
      total: this.products.length,
      active: this.products.filter((p) => p.status === "active").length,
      inactive: this.products.filter((p) => p.status === "inactive").length,
      discontinued: this.products.filter((p) => p.status === "discontinued")
        .length,
      totalStock: this.products.reduce((sum, p) => sum + p.stock, 0),
      totalValue: Math.round(totalValue * 100) / 100,
      categories: [...new Set(this.products.map((p) => p.category))],
    };
  }

  // Search products by name or category
  search(query) {
    if (!query || typeof query !== "string") {
      return [];
    }
    const lowerQuery = query.toLowerCase();
    return this.products.filter(
      (product) =>
        product.name.toLowerCase().includes(lowerQuery) ||
        product.category.toLowerCase().includes(lowerQuery)
    );
  }

  // Get products by category
  getByCategory(category) {
    return this.products.filter(
      (product) => product.category.toLowerCase() === category.toLowerCase()
    );
  }

  // Advanced search with multiple filters
  advancedSearch(filters) {
    if (!filters || typeof filters !== "object") {
      return this.products;
    }

    let results = [...this.products];

    // Filter by name (supports partial match)
    if (filters.name) {
      const nameQuery = filters.name.toLowerCase();
      results = results.filter((product) =>
        product.name.toLowerCase().includes(nameQuery)
      );
    }

    // Filter by category
    if (filters.category) {
      results = results.filter(
        (product) =>
          product.category.toLowerCase() === filters.category.toLowerCase()
      );
    }

    // Filter by status
    if (filters.status) {
      results = results.filter(
        (product) => product.status === filters.status
      );
    }

    // Filter by price range
    if (filters.minPrice !== undefined) {
      const minPrice = Number(filters.minPrice);
      if (!Number.isNaN(minPrice)) {
        results = results.filter((product) => product.price >= minPrice);
      }
    }

    if (filters.maxPrice !== undefined) {
      const maxPrice = Number(filters.maxPrice);
      if (!Number.isNaN(maxPrice)) {
        results = results.filter((product) => product.price <= maxPrice);
      }
    }

    // Filter by stock range
    if (filters.minStock !== undefined) {
      const minStock = Number(filters.minStock);
      if (!Number.isNaN(minStock)) {
        results = results.filter((product) => product.stock >= minStock);
      }
    }

    if (filters.maxStock !== undefined) {
      const maxStock = Number(filters.maxStock);
      if (!Number.isNaN(maxStock)) {
        results = results.filter((product) => product.stock <= maxStock);
      }
    }

    // Sort results
    if (filters.sortBy) {
      const sortField = filters.sortBy;
      const sortOrder = filters.sortOrder || "asc";
      const validSortFields = ["name", "price", "stock", "category", "createdAt"];

      if (validSortFields.includes(sortField)) {
        results.sort((a, b) => {
          let aValue = a[sortField];
          let bValue = b[sortField];

          if (typeof aValue === "string") {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
          }

          if (sortField === "createdAt") {
            aValue = new Date(aValue).getTime();
            bValue = new Date(bValue).getTime();
          }

          if (aValue < bValue) {
            return sortOrder === "asc" ? -1 : 1;
          }
          if (aValue > bValue) {
            return sortOrder === "asc" ? 1 : -1;
          }
          return 0;
        });
      }
    }

    // Limit results
    if (filters.limit) {
      const limit = Number(filters.limit);
      if (!Number.isNaN(limit) && limit > 0) {
        results = results.slice(0, limit);
      }
    }

    return results;
  }

  // Search products by multiple criteria with exact match
  searchByCriteria(criteria) {
    if (!criteria || typeof criteria !== "object") {
      return [];
    }

    let results = [...this.products];
    let hasFilters = false;

    if (criteria.name) {
      results = results.filter(
        (product) => product.name.toLowerCase() === criteria.name.toLowerCase()
      );
      hasFilters = true;
    }

    if (criteria.category) {
      results = results.filter(
        (product) =>
          product.category.toLowerCase() === criteria.category.toLowerCase()
      );
      hasFilters = true;
    }

    if (criteria.status) {
      results = results.filter((product) => product.status === criteria.status);
      hasFilters = true;
    }

    if (criteria.productId !== undefined) {
      const productId = Number(criteria.productId);
      if (!Number.isNaN(productId)) {
        results = results.filter((product) => product.id === productId);
        hasFilters = true;
      }
    }

    return hasFilters ? results : [];
  }

  // Get products matching any of the provided categories
  getByCategories(categories) {
    if (!Array.isArray(categories) || categories.length === 0) {
      return [];
    }

    const lowerCategories = categories.map((cat) => cat.toLowerCase());
    return this.products.filter((product) =>
      lowerCategories.includes(product.category.toLowerCase())
    );
  }

  // Get products by name pattern (supports wildcards)
  searchByNamePattern(pattern) {
    if (!pattern || typeof pattern !== "string") {
      throw new ValidationError("Pattern must be a non-empty string");
    }

    // Convert simple wildcard pattern to regex
    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // Escape special regex chars
      .replace(/\*/g, ".*") // Convert * to .*
      .replace(/\?/g, "."); // Convert ? to .

    const regex = new RegExp(regexPattern, "i"); // Case insensitive

    return this.products.filter((product) => regex.test(product.name));
  }
}

module.exports = new ProductsService();

