'use strict';

const productService = require('../services/product.service');

// POST /api/v1/products  (admin) — requireBody(['customerId','name'])
async function create(req, res, next) {
  try {
    const product = await productService.createProduct({
      customerId: req.body.customerId,
      name: req.body.name,
      partName: req.body.partName,
      createdBy: req.user.id,
    });
    res.status(201).json({ product });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/products  (admin, engineers) — ?customerId=&search=&page=&limit=
async function list(req, res, next) {
  try {
    const result = await productService.listProducts(req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/products/:id  (admin)
async function getById(req, res, next) {
  try {
    const product = await productService.getProductById(req.params.id);
    res.status(200).json({ product });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/products/:id  (admin) — edit name/partName
async function update(req, res, next) {
  try {
    const product = await productService.updateProduct(req.params.id, {
      name: req.body.name,
      partName: req.body.partName,
    });
    res.status(200).json({ product });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/products/:id  (admin) — blocked (409) when the product has history, else removes.
async function remove(req, res, next) {
  try {
    res.status(200).json(await productService.deleteProduct(req.params.id));
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getById, update, remove };
