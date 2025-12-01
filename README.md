# Mini App (Port 4000)

This is a minimal full-stack Node.js app with:

- UI served as static HTML
- REST API with controller + service + routes
- Runs on **http://localhost:4000**

## Requirements

- Node.js (>= 18)
- npm or another Node package manager

## Install

```bash
npm install
```

## Run

```bash
npm start
```

Then open:

- UI:  http://localhost:4000/
- API: http://localhost:4000/api/items

## API

- `GET /api/items` — list all items
- `POST /api/items` — create a new item

  Body:
  ```json
  { "name": "My item" }
  ```

- `DELETE /api/items/:id` — delete an item by ID
