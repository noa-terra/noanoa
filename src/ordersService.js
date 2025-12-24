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
    // Audit log for tracking all changes
    this.auditLog = [];
  }

  // Log audit entry
  _logAudit(action, orderId, details, userId = "system") {
    const auditEntry = {
      id: this.auditLog.length + 1,
      action, // 'create', 'update', 'delete', 'status_change', etc.
      orderId,
      userId,
      timestamp: new Date().toISOString(),
      details,
    };
    this.auditLog.push(auditEntry);
    
    // Keep only last 10000 audit entries to prevent memory issues
    if (this.auditLog.length > 10000) {
      this.auditLog.shift();
    }
    
    return auditEntry;
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
    
    // Log audit entry
    this._logAudit("create", order.id, {
      customerName: order.customerName,
      productId: order.productId,
      quantity: order.quantity,
      total: order.total,
      status: order.status,
    });
    
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

    const changes = {};
    if (updates.customerName !== undefined) {
      changes.customerName = { from: order.customerName, to: updates.customerName };
    }
    if (updates.quantity !== undefined) {
      changes.quantity = { from: order.quantity, to: updates.quantity };
      changes.total = { from: order.total, to: Math.round(order.price * updates.quantity * 100) / 100 };
    }
    if (updates.status !== undefined) {
      changes.status = { from: order.status, to: updates.status };
    }

    order.updatedAt = new Date().toISOString();
    
    // Log audit entry
    if (Object.keys(changes).length > 0) {
      this._logAudit("update", id, {
        changes,
        previousState: { ...order },
      });
    }
    
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

    // Log audit entry before deletion
    this._logAudit("delete", orderId, {
      order: { ...order },
    });
    
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

  // Get total revenue by status
  getRevenueByStatus() {
    const revenue = {};
    for (const order of this.orders) {
      const status = order.status;
      revenue[status] = (revenue[status] || 0) + order.total;
    }
    // Round to 2 decimal places
    for (const status in revenue) {
      revenue[status] = Math.round(revenue[status] * 100) / 100;
    }
    return revenue;
  }

  // Get total revenue by customer
  getRevenueByCustomer() {
    const revenue = {};
    for (const order of this.orders) {
      const customer = order.customerName;
      revenue[customer] = (revenue[customer] || 0) + order.total;
    }
    // Round to 2 decimal places
    for (const customer in revenue) {
      revenue[customer] = Math.round(revenue[customer] * 100) / 100;
    }
    return revenue;
  }

  // Get total revenue by product
  getRevenueByProduct() {
    const revenue = {};
    for (const order of this.orders) {
      const productId = order.productId;
      revenue[productId] = (revenue[productId] || 0) + order.total;
    }
    // Round to 2 decimal places
    for (const productId in revenue) {
      revenue[productId] = Math.round(revenue[productId] * 100) / 100;
    }
    return revenue;
  }

  // Get order count by status
  getOrderCountByStatus() {
    const counts = {};
    for (const order of this.orders) {
      counts[order.status] = (counts[order.status] || 0) + 1;
    }
    return counts;
  }

  // Get top customers by order count
  getTopCustomersByOrderCount(limit = 10) {
    const customerCounts = {};
    for (const order of this.orders) {
      const customer = order.customerName;
      customerCounts[customer] = (customerCounts[customer] || 0) + 1;
    }
    
    return Object.entries(customerCounts)
      .map(([customer, count]) => ({ customer, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  // Get top customers by revenue
  getTopCustomersByRevenue(limit = 10) {
    const revenue = this.getRevenueByCustomer();
    
    return Object.entries(revenue)
      .map(([customer, total]) => ({ customer, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }

  // Get average order value by status
  getAverageOrderValueByStatus() {
    const statusData = {};
    
    for (const order of this.orders) {
      const status = order.status;
      if (!statusData[status]) {
        statusData[status] = { total: 0, count: 0 };
      }
      statusData[status].total += order.total;
      statusData[status].count += 1;
    }

    const averages = {};
    for (const status in statusData) {
      const data = statusData[status];
      averages[status] = Math.round((data.total / data.count) * 100) / 100;
    }
    
    return averages;
  }

  // Get orders by date range with statistics
  getOrdersByDateRangeWithStats(startDate, endDate) {
    const orders = this.getByDateRange(startDate, endDate);
    
    const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
    const averageOrderValue = orders.length > 0 
      ? Math.round((totalRevenue / orders.length) * 100) / 100 
      : 0;
    
    const statusCounts = {};
    for (const order of orders) {
      statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
    }

    return {
      orders,
      statistics: {
        totalOrders: orders.length,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        averageOrderValue,
        statusCounts,
      },
    };
  }

  // Get orders by multiple statuses
  getByStatuses(statuses) {
    if (!Array.isArray(statuses) || statuses.length === 0) {
      return [];
    }

    const validStatuses = ["pending", "processing", "shipped", "completed", "cancelled"];
    const filteredStatuses = statuses.filter((status) => validStatuses.includes(status));

    if (filteredStatuses.length === 0) {
      return [];
    }

    return this.orders.filter((order) => filteredStatuses.includes(order.status));
  }

  // Get orders by multiple product IDs
  getByProductIds(productIds) {
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return [];
    }

    const validProductIds = productIds
      .map((id) => Number(id))
      .filter((id) => !Number.isNaN(id) && id > 0);

    if (validProductIds.length === 0) {
      return [];
    }

    return this.orders.filter((order) => validProductIds.includes(order.productId));
  }

  // Get orders by multiple customers
  getByCustomers(customerNames) {
    if (!Array.isArray(customerNames) || customerNames.length === 0) {
      return [];
    }

    const lowerNames = customerNames.map((name) => name.toLowerCase());
    return this.orders.filter((order) =>
      lowerNames.includes(order.customerName.toLowerCase())
    );
  }

  // Get orders with quantity range
  getByQuantityRange(minQuantity = 0, maxQuantity = Infinity) {
    const min = Number(minQuantity) || 0;
    const max = Number(maxQuantity) || Infinity;

    if (min < 0 || max < 0) {
      throw new ValidationError("Quantity range values must be non-negative");
    }
    if (min > max) {
      throw new ValidationError("Minimum quantity cannot be greater than maximum quantity");
    }

    return this.orders.filter(
      (order) => order.quantity >= min && order.quantity <= max
    );
  }

  // Advanced query with multiple filters
  advancedQuery(filters) {
    if (!filters || typeof filters !== "object") {
      return this.orders;
    }

    let results = [...this.orders];

    // Filter by status
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        results = this.getByStatuses(filters.status);
      } else {
        results = results.filter((order) => order.status === filters.status);
      }
    }

    // Filter by customer
    if (filters.customerName) {
      const customerQuery = filters.customerName.toLowerCase();
      results = results.filter((order) =>
        order.customerName.toLowerCase().includes(customerQuery)
      );
    }

    // Filter by product ID
    if (filters.productId !== undefined) {
      const productId = Number(filters.productId);
      if (!Number.isNaN(productId)) {
        results = results.filter((order) => order.productId === productId);
      }
    }

    // Filter by multiple product IDs
    if (filters.productIds && Array.isArray(filters.productIds)) {
      results = results.filter((order) =>
        filters.productIds.includes(order.productId)
      );
    }

    // Filter by total range
    if (filters.minTotal !== undefined) {
      const minTotal = Number(filters.minTotal);
      if (!Number.isNaN(minTotal)) {
        results = results.filter((order) => order.total >= minTotal);
      }
    }

    if (filters.maxTotal !== undefined) {
      const maxTotal = Number(filters.maxTotal);
      if (!Number.isNaN(maxTotal)) {
        results = results.filter((order) => order.total <= maxTotal);
      }
    }

    // Filter by quantity range
    if (filters.minQuantity !== undefined) {
      const minQuantity = Number(filters.minQuantity);
      if (!Number.isNaN(minQuantity)) {
        results = results.filter((order) => order.quantity >= minQuantity);
      }
    }

    if (filters.maxQuantity !== undefined) {
      const maxQuantity = Number(filters.maxQuantity);
      if (!Number.isNaN(maxQuantity)) {
        results = results.filter((order) => order.quantity <= maxQuantity);
      }
    }

    // Filter by date range
    if (filters.startDate && filters.endDate) {
      results = results.filter((order) => {
        const orderDate = new Date(order.createdAt);
        const start = new Date(filters.startDate);
        const end = new Date(filters.endDate);
        return orderDate >= start && orderDate <= end;
      });
    }

    // Sort results
    if (filters.sortBy) {
      const sortField = filters.sortBy;
      const sortOrder = filters.sortOrder || "desc";
      const validSortFields = [
        "id",
        "customerName",
        "productId",
        "quantity",
        "total",
        "status",
        "createdAt",
        "updatedAt",
      ];

      if (validSortFields.includes(sortField)) {
        results.sort((a, b) => {
          let aValue = a[sortField];
          let bValue = b[sortField];

          if (typeof aValue === "string") {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
          }

          if (sortField === "createdAt" || sortField === "updatedAt") {
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

  // Get audit log for a specific order
  getAuditLog(orderId) {
    const orderIdNum = Number(orderId);
    if (Number.isNaN(orderIdNum)) {
      throw new ValidationError(`Invalid orderId: ${orderId}`);
    }
    return this.auditLog.filter((entry) => entry.orderId === orderIdNum);
  }

  // Get all audit logs with optional filtering
  getAllAuditLogs(filters = {}) {
    let logs = [...this.auditLog];

    if (filters.orderId !== undefined) {
      const orderId = Number(filters.orderId);
      if (!Number.isNaN(orderId)) {
        logs = logs.filter((entry) => entry.orderId === orderId);
      }
    }

    if (filters.action) {
      logs = logs.filter((entry) => entry.action === filters.action);
    }

    if (filters.userId) {
      logs = logs.filter((entry) => entry.userId === filters.userId);
    }

    if (filters.startDate && filters.endDate) {
      const start = new Date(filters.startDate);
      const end = new Date(filters.endDate);
      logs = logs.filter((entry) => {
        const entryDate = new Date(entry.timestamp);
        return entryDate >= start && entryDate <= end;
      });
    }

    // Sort by timestamp (newest first)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Limit results
    if (filters.limit) {
      const limit = Number(filters.limit);
      if (!Number.isNaN(limit) && limit > 0) {
        logs = logs.slice(0, limit);
      }
    }

    return logs;
  }

  // Get audit statistics
  getAuditStats() {
    const stats = {
      totalEntries: this.auditLog.length,
      byAction: {},
      byUser: {},
      recentActivity: this.auditLog
        .slice(-100)
        .map((entry) => ({
          action: entry.action,
          orderId: entry.orderId,
          timestamp: entry.timestamp,
        })),
    };

    for (const entry of this.auditLog) {
      stats.byAction[entry.action] = (stats.byAction[entry.action] || 0) + 1;
      stats.byUser[entry.userId] = (stats.byUser[entry.userId] || 0) + 1;
    }

    return stats;
  }
}

module.exports = new OrdersService();

