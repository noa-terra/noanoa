const express = require("express");
const path = require("path");
const productsRoutes = require("./productsRoutes");
const ordersRoutes = require("./ordersRoutes");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api/products", productsRoutes);
app.use("/api/orders", ordersRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
