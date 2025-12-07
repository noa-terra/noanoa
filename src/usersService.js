// Custom error classes
class UserNotFoundError extends Error {
  constructor(id) {
    super(`User with id ${id} not found`);
    this.name = "UserNotFoundError";
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

class UsersService {
  constructor() {
    this.users = [
      {
        id: 1,
        name: "John Doe",
        email: "john@example.com",
        role: "user",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "active",
      },
      {
        id: 2,
        name: "Jane Smith",
        email: "jane@example.com",
        role: "admin",
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
      throw new ValidationError("User name must be a non-empty string");
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new ValidationError("User name cannot be empty");
    }
    if (trimmed.length > 100) {
      throw new ValidationError("User name cannot exceed 100 characters");
    }
    return trimmed;
  }

  validateEmail(email) {
    if (!email || typeof email !== "string") {
      throw new ValidationError("Email must be a non-empty string");
    }
    const trimmed = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      throw new ValidationError("Invalid email format");
    }
    return trimmed;
  }

  // Get all users with optional filtering
  getAll(status = null) {
    let result = [...this.users];
    if (status) {
      result = result.filter((user) => user.status === status);
    }
    return result;
  }

  // Get user by ID
  getById(id) {
    const userId = Number(id);
    if (Number.isNaN(userId)) {
      throw new ValidationError(`Invalid id: ${id}`);
    }
    const user = this.users.find((user) => user.id === userId);
    if (!user) {
      throw new UserNotFoundError(userId);
    }
    return user;
  }

  // Create new user with validation
  create(data) {
    const name = this.validateName(data.name);
    const email = this.validateEmail(data.email);
    const role = data.role || "user";

    // Check for duplicate email
    const duplicate = this.users.find(
      (user) => user.email.toLowerCase() === email.toLowerCase()
    );
    if (duplicate) {
      throw new ValidationError(`User with email "${email}" already exists`);
    }

    // Validate role
    if (!["user", "admin", "moderator"].includes(role)) {
      throw new ValidationError(
        `Invalid role. Must be one of: user, admin, moderator`
      );
    }

    const user = {
      id: this.nextId++,
      name,
      email,
      role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "active",
    };

    this.users.push(user);
    return user;
  }

  // Update existing user
  update(id, updates) {
    const user = this.getById(id);

    if (updates.name !== undefined) {
      user.name = this.validateName(updates.name);
    }

    if (updates.email !== undefined) {
      const email = this.validateEmail(updates.email);
      // Check for duplicates (excluding current user)
      const duplicate = this.users.find(
        (u) => u.id !== id && u.email.toLowerCase() === email.toLowerCase()
      );
      if (duplicate) {
        throw new ValidationError(`User with email "${email}" already exists`);
      }
      user.email = email;
    }

    if (updates.role !== undefined) {
      if (!["user", "admin", "moderator"].includes(updates.role)) {
        throw new ValidationError(
          `Invalid role. Must be one of: user, admin, moderator`
        );
      }
      user.role = updates.role;
    }

    if (updates.status !== undefined) {
      if (!["active", "inactive", "suspended"].includes(updates.status)) {
        throw new ValidationError(
          `Invalid status. Must be one of: active, inactive, suspended`
        );
      }
      user.status = updates.status;
    }

    user.updatedAt = new Date().toISOString();
    return user;
  }

  // Delete user (throws error if not found)
  delete(id) {
    const userId = Number(id);
    if (Number.isNaN(userId)) {
      throw new ValidationError(`Invalid id: ${id}`);
    }

    const index = this.users.findIndex((user) => user.id === userId);
    if (index === -1) {
      throw new UserNotFoundError(userId);
    }

    this.users.splice(index, 1);
    return { success: true, deletedId: userId };
  }

  // Get user statistics
  getStats() {
    return {
      total: this.users.length,
      active: this.users.filter((u) => u.status === "active").length,
      inactive: this.users.filter((u) => u.status === "inactive").length,
      suspended: this.users.filter((u) => u.status === "suspended").length,
      admins: this.users.filter((u) => u.role === "admin").length,
    };
  }

  // Search users by name or email
  search(query) {
    if (!query || typeof query !== "string") {
      return [];
    }
    const lowerQuery = query.toLowerCase();
    return this.users.filter(
      (user) =>
        user.name.toLowerCase().includes(lowerQuery) ||
        user.email.toLowerCase().includes(lowerQuery)
    );
  }
}

module.exports = new UsersService();

