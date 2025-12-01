class ItemsService {
  constructor() {
    this.items = [
      { id: 1, name: 'First item' },
      { id: 2, name: 'Another item' },
    ];
  }

  getAll() {
    return this.items;
  }

  create(name) {
    const nextId = this.items.length ? this.items[this.items.length - 1].id + 1 : 1;
    const item = { id: nextId, name };
    this.items.push(item);
    return item;
  }

  delete(id) {
    this.items = this.items.filter((item) => item.id !== id);
  }
}

module.exports = new ItemsService();
