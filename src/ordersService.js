// Custom error classes
class OrderNotFoundError extends Error {
  constructor(id) {
    super(`Order with id ${id} not found`);
    this.name = "OrderNotFoundError";
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

class OrdersService {
  constructor() {
    this.orders = [
      {
        id: 1,
        customerName: "Alice Johnson",
        productId: 1,
        quantity: 2,
        total: 1999.98,
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 2,
        customerName: "Bob Smith",
        productId: 2,
        quantity: 1,
        total: 49.99,
        status: "completed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    this.nextId = 3;
  }

  // Validation helpers
  validateCustomerName(name) {
    if (!name || typeof name !== "string") {
      throw new ValidationError("Customer name must be a non-empty string");
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new ValidationError("Customer name cannot be empty");
    }
    if (trimmed.length > 100) {
      throw new ValidationError("Customer name cannot exceed 100 characters");
    }
    return trimmed;
  }

  validateQuantity(quantity) {
    const qty = Number(quantity);
    if (Number.isNaN(qty) || qty < 1 || !Number.isInteger(qty)) {
      throw new ValidationError("Quantity must be a positive integer");
    }
    return qty;
  }

  // Get all orders with optional filtering
  getAll(status = null) {
    let result = [...this.orders];
    if (status) {
      result = result.filter((order) => order.status === status);
    }
    return result;
  }

  // Get order by ID
  getById(id) {
    const orderId = Number(id);
    if (Number.isNaN(orderId)) {
      throw new ValidationError(`Invalid id: ${id}`);
    }
    const order = this.orders.find((order) => order.id === orderId);
    if (!order) {
      throw new OrderNotFoundError(orderId);
    }
    return order;
  }

  // Create new order with validation
  create(data) {
    const customerName = this.validateCustomerName(data.customerName);
    const productId = Number(data.productId);
    const quantity = this.validateQuantity(data.quantity);
    const price = Number(data.price);

    if (Number.isNaN(productId) || productId < 1) {
      throw new ValidationError("Valid productId is required");
    }

    if (Number.isNaN(price) || price < 0) {
      throw new ValidationError("Valid price is required");
    }

    const total = Math.round(price * quantity * 100) / 100;

    const order = {
      id: this.nextId++,
      customerName,
      productId,
      quantity,
      price,
      total,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.orders.push(order);
    return order;
  }

  // Update existing order
  update(id, updates) {
    const order = this.getById(id);

    if (updates.customerName !== undefined) {
      order.customerName = this.validateCustomerName(updates.customerName);
    }

    if (updates.quantity !== undefined) {
      const quantity = this.validateQuantity(updates.quantity);
      order.quantity = quantity;
      order.total = Math.round(order.price * quantity * 100) / 100;
    }

    if (updates.status !== undefined) {
      if (
        !["pending", "processing", "shipped", "completed", "cancelled"].includes(
          updates.status
        )
      ) {
        throw new ValidationError(
          `Invalid status. Must be one of: pending, processing, shipped, completed, cancelled`
        );
      }
      order.status = updates.status;
    }

    order.updatedAt = new Date().toISOString();
    return order;
  }

  // Delete order (throws error if not found)
  delete(id) {
    const orderId = Number(id);
    if (Number.isNaN(orderId)) {
      throw new ValidationError(`Invalid id: ${id}`);
    }

    const index = this.orders.findIndex((order) => order.id === orderId);
    if (index === -1) {
      throw new OrderNotFoundError(orderId);
    }

    this.orders.splice(index, 1);
    return { success: true, deletedId: orderId };
  }

  // Get order statistics
  getStats() {
    const totalValue = this.orders.reduce((sum, o) => sum + o.total, 0);
    return {
      total: this.orders.length,
      pending: this.orders.filter((o) => o.status === "pending").length,
      processing: this.orders.filter((o) => o.status === "processing").length,
      shipped: this.orders.filter((o) => o.status === "shipped").length,
      completed: this.orders.filter((o) => o.status === "completed").length,
      cancelled: this.orders.filter((o) => o.status === "cancelled").length,
      totalValue: Math.round(totalValue * 100) / 100,
      averageOrderValue:
        this.orders.length > 0
          ? Math.round((totalValue / this.orders.length) * 100) / 100
          : 0,
    };
  }

  // Get orders by customer name
  getByCustomer(customerName) {
    return this.orders.filter(
      (order) =>
        order.customerName.toLowerCase() === customerName.toLowerCase()
    );
  }

  // Get orders by product ID
  getByProduct(productId) {
    const pid = Number(productId);
    if (Number.isNaN(pid)) {
      throw new ValidationError(`Invalid productId: ${productId}`);
    }
    return this.orders.filter((order) => order.productId === pid);
  }

  // Get orders by date range
  getByDateRange(startDate, endDate) {
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
    
    return this.orders.filter((order) => {
      const orderDate = new Date(order.createdAt);
      return orderDate >= start && orderDate <= end;
    });
  }

  // Get orders by total value range
  getByTotalRange(minTotal = 0, maxTotal = Infinity) {
    const min = Number(minTotal) || 0;
    const max = Number(maxTotal) || Infinity;
    
    if (min < 0 || max < 0) {
      throw new ValidationError("Total range values must be non-negative");
    }
    if (min > max) {
      throw new ValidationError("Minimum total cannot be greater than maximum total");
    }
    
    return this.orders.filter(
      (order) => order.total >= min && order.total <= max
    );
  }

  // Get orders with sorting
  getSorted(sortBy = "createdAt", order = "desc") {
    const validSortFields = ["id", "customerName", "productId", "quantity", "total", "status", "createdAt", "updatedAt"];
    const validOrders = ["asc", "desc"];

    if (!validSortFields.includes(sortBy)) {
      throw new ValidationError(
        `Invalid sort field. Must be one of: ${validSortFields.join(", ")}`
      );
    }

    if (!validOrders.includes(order.toLowerCase())) {
      throw new ValidationError(`Invalid sort order. Must be 'asc' or 'desc'`);
    }

    const sorted = [...this.orders].sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      // Handle string comparison
      if (typeof aValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      // Handle date comparison
      if (sortBy === "createdAt" || sortBy === "updatedAt") {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      if (aValue < bValue) {
        return order.toLowerCase() === "asc" ? -1 : 1;
      }
      if (aValue > bValue) {
        return order.toLowerCase() === "asc" ? 1 : -1;
      }
      return 0;
    });

    return sorted;
  }

  // Get orders grouped by status
  getGroupedByStatus() {
    const grouped = {};
    for (const order of this.orders) {
      if (!grouped[order.status]) {
        grouped[order.status] = [];
      }
      grouped[order.status].push(order);
    }
    return grouped;
  }

  // Get orders grouped by customer
  getGroupedByCustomer() {
    const grouped = {};
    for (const order of this.orders) {
      const customerKey = order.customerName.toLowerCase();
      if (!grouped[customerKey]) {
        grouped[customerKey] = [];
      }
      grouped[customerKey].push(order);
    }
    return grouped;
  }
}

module.exports = new OrdersService();

