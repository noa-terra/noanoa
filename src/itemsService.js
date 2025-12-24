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

  // Get items with pagination
  getPaginated(page = 1, limit = 10, status = null) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Math.min(100, Number(limit) || 10));
    
    let filteredItems = [...this.items];
    if (status) {
      filteredItems = filteredItems.filter((item) => item.status === status);
    }
    
    const total = filteredItems.length;
    const totalPages = Math.ceil(total / limitNum);
    const offset = (pageNum - 1) * limitNum;
    const paginatedItems = filteredItems.slice(offset, offset + limitNum);
    
    return {
      items: paginatedItems,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    };
  }

  // Bulk create items
  bulkCreate(names) {
    if (!Array.isArray(names) || names.length === 0) {
      throw new ValidationError("Names must be a non-empty array");
    }
    if (names.length > 100) {
      throw new ValidationError("Cannot create more than 100 items at once");
    }

    const created = [];
    const errors = [];

    for (let i = 0; i < names.length; i++) {
      try {
        const item = this.create(names[i]);
        created.push(item);
      } catch (error) {
        errors.push({
          index: i,
          name: names[i],
          error: error.message,
        });
      }
    }

    return {
      created,
      errors,
      successCount: created.length,
      errorCount: errors.length,
    };
  }

  // Bulk update items
  bulkUpdate(updates) {
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new ValidationError("Updates must be a non-empty array");
    }
    if (updates.length > 100) {
      throw new ValidationError("Cannot update more than 100 items at once");
    }

    const updated = [];
    const errors = [];

    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      if (!update.id) {
        errors.push({
          index: i,
          update,
          error: "Missing required field: id",
        });
        continue;
      }

      try {
        const item = this.update(update.id, update);
        updated.push(item);
      } catch (error) {
        errors.push({
          index: i,
          id: update.id,
          error: error.message,
        });
      }
    }

    return {
      updated,
      errors,
      successCount: updated.length,
      errorCount: errors.length,
    };
  }

  // Bulk delete items
  bulkDelete(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ValidationError("Ids must be a non-empty array");
    }
    if (ids.length > 100) {
      throw new ValidationError("Cannot delete more than 100 items at once");
    }

    const deleted = [];
    const errors = [];

    for (let i = 0; i < ids.length; i++) {
      try {
        const result = this.delete(ids[i]);
        deleted.push(result.deletedId);
      } catch (error) {
        errors.push({
          index: i,
          id: ids[i],
          error: error.message,
        });
      }
    }

    return {
      deleted,
      errors,
      successCount: deleted.length,
      errorCount: errors.length,
    };
  }
}

module.exports = new ItemsService();

