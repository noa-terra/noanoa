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

  // Get items by multiple IDs (batch lookup)
  getByIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      return [];
    }
    if (ids.length > 100) {
      throw new ValidationError("Cannot fetch more than 100 items at once");
    }

    const found = [];
    const notFound = [];

    for (const id of ids) {
      try {
        const item = this.getById(id);
        found.push(item);
      } catch (error) {
        notFound.push(id);
      }
    }

    return {
      items: found,
      notFound,
      foundCount: found.length,
      notFoundCount: notFound.length,
    };
  }

  // Get items created in date range
  getByCreatedDateRange(startDate, endDate) {
    if (!startDate || !endDate) {
      throw new ValidationError("Both startDate and endDate are required");
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new ValidationError("Invalid date format");
    }
    
    if (start > end) {
      throw new ValidationError("Start date cannot be after end date");
    }
    
    return this.items.filter((item) => {
      const itemDate = new Date(item.createdAt);
      return itemDate >= start && itemDate <= end;
    });
  }

  // Get items updated in date range
  getByUpdatedDateRange(startDate, endDate) {
    if (!startDate || !endDate) {
      throw new ValidationError("Both startDate and endDate are required");
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new ValidationError("Invalid date format");
    }
    
    if (start > end) {
      throw new ValidationError("Start date cannot be after end date");
    }
    
    return this.items.filter((item) => {
      const itemDate = new Date(item.updatedAt);
      return itemDate >= start && itemDate <= end;
    });
  }

  // Get recently created items
  getRecentlyCreated(days = 7) {
    const daysNum = Number(days) || 7;
    if (daysNum < 0) {
      throw new ValidationError("Days must be non-negative");
    }
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysNum);
    
    return this.items.filter((item) => {
      const itemDate = new Date(item.createdAt);
      return itemDate >= cutoffDate;
    });
  }

  // Get recently updated items
  getRecentlyUpdated(days = 7) {
    const daysNum = Number(days) || 7;
    if (daysNum < 0) {
      throw new ValidationError("Days must be non-negative");
    }
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysNum);
    
    return this.items.filter((item) => {
      const itemDate = new Date(item.updatedAt);
      return itemDate >= cutoffDate;
    });
  }

  // Get items by name pattern (supports wildcards)
  getByNamePattern(pattern) {
    if (!pattern || typeof pattern !== "string") {
      throw new ValidationError("Pattern must be a non-empty string");
    }
    
    // Convert simple wildcard pattern to regex
    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // Escape special regex chars
      .replace(/\*/g, ".*") // Convert * to .*
      .replace(/\?/g, "."); // Convert ? to .
    
    const regex = new RegExp(regexPattern, "i"); // Case insensitive
    
    return this.items.filter((item) => regex.test(item.name));
  }

  // Enhanced bulk create with transaction support (all or nothing)
  bulkCreateTransactional(names, options = {}) {
    if (!Array.isArray(names) || names.length === 0) {
      throw new ValidationError("Names must be a non-empty array");
    }
    if (names.length > 100) {
      throw new ValidationError("Cannot create more than 100 items at once");
    }

    const rollback = options.rollbackOnError !== false; // Default: true
    const created = [];
    const errors = [];

    // Snapshot for rollback
    const snapshot = {
      items: [...this.items],
      nextId: this.nextId,
    };

    try {
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

          if (rollback && errors.length > 0) {
            // Rollback: restore snapshot
            this.items = snapshot.items;
            this.nextId = snapshot.nextId;
            this._rebuildIndexes();
            throw new ValidationError(
              `Transaction failed at index ${i}: ${error.message}. All changes rolled back.`
            );
          }
        }
      }

      return {
        created,
        errors,
        successCount: created.length,
        errorCount: errors.length,
        transactional: rollback,
      };
    } catch (error) {
      // Ensure rollback happened
      if (rollback) {
        this.items = snapshot.items;
        this.nextId = snapshot.nextId;
        this._rebuildIndexes();
      }
      throw error;
    }
  }

  // Enhanced bulk update with validation before execution
  bulkUpdateWithValidation(updates) {
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new ValidationError("Updates must be a non-empty array");
    }
    if (updates.length > 100) {
      throw new ValidationError("Cannot update more than 100 items at once");
    }

    // Pre-validate all updates before executing any
    const validationErrors = [];
    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      if (!update.id) {
        validationErrors.push({
          index: i,
          update,
          error: "Missing required field: id",
        });
        continue;
      }

      // Check if item exists
      if (!this.indexes.byId.has(Number(update.id))) {
        validationErrors.push({
          index: i,
          id: update.id,
          error: "Item not found",
        });
        continue;
      }

      // Validate update data
      try {
        if (update.name !== undefined) {
          this.validateName(update.name);
        }
        if (update.status !== undefined) {
          this.validateStatus(update.status);
        }
      } catch (error) {
        validationErrors.push({
          index: i,
          id: update.id,
          error: error.message,
        });
      }
    }

    // If any validation errors, return them without making changes
    if (validationErrors.length > 0) {
      return {
        updated: [],
        errors: validationErrors,
        successCount: 0,
        errorCount: validationErrors.length,
        validated: true,
      };
    }

    // All validations passed, proceed with updates
    const updated = [];
    for (let i = 0; i < updates.length; i++) {
      const item = this.update(updates[i].id, updates[i]);
      updated.push(item);
    }

    return {
      updated,
      errors: [],
      successCount: updated.length,
      errorCount: 0,
      validated: true,
    };
  }

  // Batch operations: create, update, delete in one transaction
  batchOperations(operations) {
    if (!Array.isArray(operations) || operations.length === 0) {
      throw new ValidationError("Operations must be a non-empty array");
    }
    if (operations.length > 100) {
      throw new ValidationError("Cannot process more than 100 operations at once");
    }

    const results = {
      created: [],
      updated: [],
      deleted: [],
      errors: [],
    };

    // Snapshot for rollback
    const snapshot = {
      items: [...this.items],
      nextId: this.nextId,
    };

    try {
      for (let i = 0; i < operations.length; i++) {
        const operation = operations[i];
        const { type, data } = operation;

        try {
          switch (type) {
            case "create":
              if (!data || !data.name) {
                throw new ValidationError("Create operation requires 'name' in data");
              }
              const created = this.create(data.name);
              if (data.status) {
                this.update(created.id, { status: data.status });
                created.status = data.status;
              }
              results.created.push(created);
              break;

            case "update":
              if (!data || !data.id) {
                throw new ValidationError("Update operation requires 'id' in data");
              }
              const updated = this.update(data.id, data);
              results.updated.push(updated);
              break;

            case "delete":
              if (!data || !data.id) {
                throw new ValidationError("Delete operation requires 'id' in data");
              }
              const deleted = this.delete(data.id);
              results.deleted.push(deleted.deletedId);
              break;

            default:
              throw new ValidationError(`Unknown operation type: ${type}`);
          }
        } catch (error) {
          results.errors.push({
            index: i,
            operation: type,
            data,
            error: error.message,
          });
          // Rollback on any error
          this.items = snapshot.items;
          this.nextId = snapshot.nextId;
          this._rebuildIndexes();
          throw new ValidationError(
            `Batch operation failed at index ${i}: ${error.message}. All changes rolled back.`
          );
        }
      }

      return {
        ...results,
        successCount:
          results.created.length + results.updated.length + results.deleted.length,
        errorCount: results.errors.length,
      };
    } catch (error) {
      // Ensure rollback
      this.items = snapshot.items;
      this.nextId = snapshot.nextId;
      this._rebuildIndexes();
      throw error;
    }
  }
}

module.exports = new ItemsService();

