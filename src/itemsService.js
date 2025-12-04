// Custom error classes
class ItemNotFoundError extends Error {
  constructor(id) {
    super(`Item with id ${id} not found`);
    this.name = "ItemNotFoundError";
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

class ItemsService {
  constructor() {
    this.items = [
      {
        id: 1,
        name: "First item",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "active",
      },
      {
        id: 2,
        name: "Another item",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "active",
      },
    ];
    this.nextId = 3;
  }

  // Validation helper
  validateName(name) {
    if (!name || typeof name !== "string") {
      throw new ValidationError("Item name must be a non-empty string");
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new ValidationError("Item name cannot be empty");
    }
    if (trimmed.length > 100) {
      throw new ValidationError("Item name cannot exceed 100 characters");
    }
    return trimmed;
  }

  // Get all items with optional filtering
  getAll(status = null) {
    let result = [...this.items];
    if (status) {
      result = result.filter((item) => item.status === status);
    }
    return result;
  }

  // Get item by ID
  getById(id) {
    const itemId = Number(id);
    if (Number.isNaN(itemId)) {
      throw new ValidationError(`Invalid id: ${id}`);
    }
    const item = this.items.find((item) => item.id === itemId);
    if (!item) {
      throw new ItemNotFoundError(itemId);
    }
    return item;
  }

  // Create new item with validation
  create(name) {
    const validatedName = this.validateName(name);
    
    // Check for duplicates
    const duplicate = this.items.find(
      (item) => item.name.toLowerCase() === validatedName.toLowerCase()
    );
    if (duplicate) {
      throw new ValidationError(
        `Item with name "${validatedName}" already exists`
      );
    }

    const item = {
      id: this.nextId++,
      name: validatedName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "active",
    };
    
    this.items.push(item);
    return item;
  }

  // Update existing item
  update(id, updates) {
    const item = this.getById(id);
    
    if (updates.name !== undefined) {
      const validatedName = this.validateName(updates.name);
      // Check for duplicates (excluding current item)
      const duplicate = this.items.find(
        (i) =>
          i.id !== id &&
          i.name.toLowerCase() === validatedName.toLowerCase()
      );
      if (duplicate) {
        throw new ValidationError(
          `Item with name "${validatedName}" already exists`
        );
      }
      item.name = validatedName;
    }

    if (updates.status !== undefined) {
      if (!["active", "archived", "deleted"].includes(updates.status)) {
        throw new ValidationError(
          `Invalid status. Must be one of: active, archived, deleted`
        );
      }
      item.status = updates.status;
    }

    item.updatedAt = new Date().toISOString();
    return item;
  }

  // Delete item (throws error if not found)
  delete(id) {
    const itemId = Number(id);
    if (Number.isNaN(itemId)) {
      throw new ValidationError(`Invalid id: ${id}`);
    }
    
    const index = this.items.findIndex((item) => item.id === itemId);
    if (index === -1) {
      throw new ItemNotFoundError(itemId);
    }
    
    this.items.splice(index, 1);
    return { success: true, deletedId: itemId };
  }

  // Get statistics
  getStats() {
    return {
      total: this.items.length,
      active: this.items.filter((i) => i.status === "active").length,
      archived: this.items.filter((i) => i.status === "archived").length,
      deleted: this.items.filter((i) => i.status === "deleted").length,
    };
  }

  // Search items by name
  search(query) {
    if (!query || typeof query !== "string") {
      return [];
    }
    const lowerQuery = query.toLowerCase();
    return this.items.filter((item) =>
      item.name.toLowerCase().includes(lowerQuery)
    );
  }
}

module.exports = new ItemsService();

