const app = require('../app')
const User = require('../models/user')
const Product = require('../models/product')
const mongoose = require('mongoose')
const request = require('supertest')
const http = require('../utils/http')
const bcrypt = require('bcrypt')

let products = []

beforeAll(async () => {
    await mongoose.connect(process.env.TEST_DATABASE_URL, { serverSelectionTimeoutMS: 2500 })
        .catch(err => {
            console.error(`Error connecting to MongoDB: ${err}`)
            process.exitCode = 1
        })
    // Create a test user
    const hp1 = await bcrypt.hash("admin-product", 10)
    const admin = new User({
        email: "admin@product.test",
        username: "AdminProduct",
        password: hp1,
        access_level: 3
    })
    await admin.save()

    // Create a second test user
    const hp2 = await bcrypt.hash("user-product", 10)
    const user = new User({
        email: "user@product.test",
        username: "UserProduct",
        password: hp2
    })
    await user.save()

    // Create dummy products
    const product = new Product({
        name: "product 1",
        description: "this is product 1",
        price: 10.49,
        stock: 10
    })
    await product.save()

    const product2 = new Product({
        name: "product 2",
        description: "this is product 2",
        price: 5.73,
        stock: 10
    })
    await product2.save()

    const product3 = new Product({
        name: "product 3",
        description: "this is product 3",
        price: 13.21,
        stock: 10
    })
    await product3.save()

    products.push(product)
    products.push(product2)
    products.push(product3)
})

afterAll(async () => {
    // Delete the dummy user and products
    const user = await User.findOne({ email: "admin@product.test" })
    await user.delete()
    for (let i = 0; i < products.length; i++) {
        await products[i].delete()
    }
    await User.deleteOne({ email: "user@product.test" })
    await mongoose.connection.close()
})

describe("GET /products", () => {
    test("should get products", async () => {
        const res = await request(app).get("/products").expect("Content-Type", /json/)
        expect(res.statusCode).toBe(http.statusOK)
    })
})

describe("GET /products/:id", () => {
    test("should get product", async () => {
        const product = await Product.findOne({ name: "product 1" })
        const res = await request(app).get(`/products/${product._id}`)
        expect(res.statusCode).toBe(http.statusOK)
        expect(res.body["_id"]).toBe(product._id.toString())
    })

    test("should not find product", async () => {
        productId = mongoose.Types.ObjectId();
        const res = await request(app).get(`/products/${productId}`)
        expect(res.statusCode).toBe(http.statusNotFound)
        expect(res.body["_id"]).toBeUndefined()
    })
})

describe("POST /products", () => {
    test("users with access level 2 or higher should create a product", async () => {
        const u = await request(app).post("/login").send({
            email: "admin@product.test",
            password: "admin-product"
        })
        expect(u.statusCode).toBe(http.statusOK)

        const res = await request(app).post("/products").set({"Authorization": u.headers["authorization"]}).send({
            name: "product 4",
            description: "this is product 4",
            price: 20,
            stock: 10
        })
        expect(res.statusCode).toBe(http.statusCreated)
        expect(res.body["_id"]).toBeDefined()

        await Product.deleteOne({"_id": res.body["_id"]})
    })

    test("unauthenticated user should fail to create a product", async () => {
        const res = await request(app).post("/products").send({
            name: "product 4",
            description: "this is product 4",
            price: 20,
            stock: 10
        })
        expect(res.statusCode).toBe(http.statusUnauthorized)
        expect(res.body["_id"]).toBeUndefined()
    })

    test("unauthorized user should fail to create a product", async () => {
        const u = await request(app).post("/login").send({
            email: "user@product.test",
            password: "user-product"
        })
        expect(u.statusCode).toBe(http.statusOK)

        const res = await request(app).post("/products").set({ "Authorization": u.headers["authorization"] }).send({
            name: "product 4",
            description: "this is product 4",
            price: 20,
            stock: 10
        })
        expect(res.statusCode).toBe(http.statusForbidden)
        expect(res.body["_id"]).toBeUndefined()
    })

    test("product name should be at least 5 characters long", async () => {
        const u = await request(app).post("/login").send({
            email: "admin@product.test",
            password: "admin-product"
        })
        expect(u.statusCode).toBe(http.statusOK)

        const res = await request(app).post("/products").set({ "Authorization": u.headers["authorization"] }).send({
            name: "123",
            description: "this is product 4",
            price: 20,
            stock: 10
        })
        expect(res.statusCode).toBe(http.statusBadRequest)
        expect(res.body["_id"]).toBeUndefined()
    })

    test("product price should not be negative", async () => {
        const u = await request(app).post("/login").send({
            email: "admin@product.test",
            password: "admin-product"
        })
        expect(u.statusCode).toBe(http.statusOK)

        const res = await request(app).post("/products").set({ "Authorization": u.headers["authorization"] }).send({
            name: "product 4",
            description: "this is product 4",
            price: -1,
            stock: 10
        })
        expect(res.statusCode).toBe(http.statusBadRequest)
        expect(res.body["_id"]).toBeUndefined()
    })

    test("product stock should be at least 1 or more", async () => {
        const u = await request(app).post("/login").send({
            email: "admin@product.test",
            password: "admin-product"
        })
        expect(u.statusCode).toBe(http.statusOK)

        const res = await request(app).post("/products").set({ "Authorization": u.headers["authorization"] }).send({
            name: "product 4",
            description: "this is product 4",
            price: 20,
            stock: 0
        })
        expect(res.statusCode).toBe(http.statusBadRequest)
        expect(res.body["_id"]).toBeUndefined()
    })
})

describe("PUT /products/:id", () => {
    test("authorized user should successfully update a product", async () => {
        const u = await request(app).post("/login").send({
            email: "admin@product.test",
            password: "admin-product"
        })
        expect(u.statusCode).toBe(http.statusOK)

        const product = await Product.findOne({ name: "product 1" })
        const res = await request(app).put(`/products/${product._id}`).set({ "Authorization": u.headers["authorization"] }).send({
            name: "updated product 1",
            description: "updated description",
            price: 20.59,
            stock: 10
        })

        expect(res.statusCode).toBe(http.statusOK)
        expect(res.body["name"]).toBe("updated product 1")
    })

    test("unauthorized user should fail to update a product", async () => {
        const u = await request(app).post("/login").send({
            email: "user@product.test",
            password: "user-product"
        })
        expect(u.statusCode).toBe(http.statusOK)

        const product = await Product.findOne({ name: "product 2" })
        const res = await request(app).put(`/products/${product._id}`).set({ "Authorization": u.headers["authorization"]}).send({
            name: "updated product 2",
            description: "updated description",
            price: 20.59,
            stock: 10
        })

        expect(res.statusCode).toBe(http.statusForbidden)
        expect(res.body["name"]).toBeUndefined()
    })

    test("product name should be at least 5 characters long", async () => {
        const u = await request(app).post("/login").send({
            email: "admin@product.test",
            password: "admin-product"
        })
        expect(u.statusCode).toBe(http.statusOK)

        const product = await Product.findOne({ name: "product 2" })
        const res = await request(app).put(`/products/${product._id}`).set({ "Authorization": u.headers["authorization"] }).send({
            name: "123",
            description: "updated description",
            price: 20.59,
            stock: 10
        })

        expect(res.statusCode).toBe(http.statusBadRequest)
        expect(res.body["name"]).toBeUndefined()
    })

    test("product price should not be negative", async () => {
        const u = await request(app).post("/login").send({
            email: "admin@product.test",
            password: "admin-product"
        })
        expect(u.statusCode).toBe(http.statusOK)

        const product = await Product.findOne({ name: "product 2" })
        const res = await request(app).put(`/products/${product._id}`).set({ "Authorization": u.headers["authorization"] }).send({
            name: "12345",
            description: "updated description",
            price: -5,
            stock: 10
        })

        expect(res.statusCode).toBe(http.statusBadRequest)
        expect(res.body["name"]).toBeUndefined()
    })

    test("product stock should be at least 1 or more", async () => {
        const u = await request(app).post("/login").send({
            email: "admin@product.test",
            password: "admin-product"
        })
        expect(u.statusCode).toBe(http.statusOK)

        const product = await Product.findOne({ name: "product 2" })
        const res = await request(app).put(`/products/${product._id}`).set({ "Authorization": u.headers["authorization"] }).send({
            name: "12345",
            description: "updated description",
            price: 25,
            stock: 0
        })

        expect(res.statusCode).toBe(http.statusBadRequest)
        expect(res.body["name"]).toBeUndefined()
    })

    test("should not find product", async () => {
        const u = await request(app).post("/login").send({
            email: "admin@product.test",
            password: "admin-product"
        })
        expect(u.statusCode).toBe(http.statusOK)

        const id = mongoose.Types.ObjectId()
        const res = await request(app).put(`/products/${id}`).set({ "Authorization": u.headers["authorization"] }).send({
            name: "12345",
            description: "updated description",
            price: 20.59,
            stock: 10
        })

        expect(res.statusCode).toBe(http.statusNotFound)
        expect(res.body["name"]).toBeUndefined()
    })
})

describe("DELETE /products/:id", () => {
    test("authorized user should delete product", async () => {
        const u = await request(app).post("/login").send({
            email: "admin@product.test",
            password: "admin-product"
        })
        expect(u.statusCode).toBe(http.statusOK)
        
        const product = await Product.findOne({ name: "product 3" })
        const res = await request(app).delete(`/products/${product._id}`).set({ "Authorization": u.headers["authorization"] })
        expect(res.statusCode).toBe(http.statusOK)
        expect(await Product.findOne({ _id: product._id })).toBeNull()
    })

    test("unauthorized user should fail to delete product", async () => {
        const u = await request(app).post("/login").send({
            email: "user@product.test",
            password: "user-product"
        })
        expect(u.statusCode).toBe(http.statusOK)

        const product = await Product.findOne({ name: "product 2" })
        const res = await request(app).delete(`/products/${product._id}`).set({ "Authorization": u.headers["authorization"] })
        expect(res.statusCode).toBe(http.statusForbidden)
    })

    test("should not find product to delete", async () => {
        const u = await request(app).post("/login").send({
            email: "admin@product.test",
            password: "admin-product"
        })
        expect(u.statusCode).toBe(http.statusOK)

        const id = mongoose.Types.ObjectId()
        const res = await request(app).delete(`/products/${id}`).set({ "Authorization": u.headers["authorization"] })
        expect(res.statusCode).toBe(http.statusNotFound)
    })
})
