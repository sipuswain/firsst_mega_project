import asyncHandler from "../services/asyncHandler.js"
import CustomError from "../utils/customError.js"
import Product from "../models/product.Schema.js"
import Collection from "../models/collection.Schema.js"
import { readProductInput } from "../utils/productInput.js"
import { readListQuery } from "../utils/productQuery.js"
import { isValidObjectId } from "../utils/objectId.js"
import { checkImageFiles, MAX_IMAGES } from "../utils/imageCheck.js"
import { uploadImageBuffer, deleteImage } from "../services/imageUpload.js"
import { uploadAllOrRollback, deleteImages } from "../services/productImages.js"

// The collection sent in the body must really exist
const checkCollectionExists = async (collectionId) => {
  if (!(await Collection.exists({ _id: collectionId }))) {
    throw new CustomError("Collection does not exist", 400)
  }
}

// Shared by "list all" and "list one collection".
// Gets the checked filter/sort/page, asks the database, and sends the answer.
const sendProductList = async (req, res, forcedCollectionId) => {
  const { filter, sort, page, limit, skip } = readListQuery(req.query, forcedCollectionId)

  // count and find at the same time
  const [total, products] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter).sort(sort).skip(skip).limit(limit).lean(),
  ])

  res.status(200).json({
    success: true,
    total,                              // all products that match the filters
    page,                               // the page we are sending
    pages: Math.ceil(total / limit),    // how many pages exist (0 when nothing matched)
    count: products.length,             // how many products are in this page
    products,
  })
}

/******************************************************
 * @Create_PRODUCT
 * @route POST /api/product   (ADMIN only)
 * @description to create a product
 * @parameters name, price, collectionId (required); description, stock (optional)
 *   JSON, or multipart/form-data with up to 5 image files in the field "photos"
 * @returns created product
 ******************************************************/

export const createProduct = asyncHandler(async (req, res) => {
  // only the allowed fields come out of here (sold, photos, _id ... are ignored)
  const data = readProductInput(req.body, true)

  // req.files only exists for multipart requests (see upload middleware)
  const files = req.files ?? []
  // check everything BEFORE uploading, so a bad request never sends anything to Cloudinary
  checkImageFiles(files, 0)
  await checkCollectionExists(data.collectionId)

  // photos are only ever set here, from the real upload result, never from the request body
  const photos = files.length ? await uploadAllOrRollback(files, uploadImageBuffer, deleteImage) : []

  let product
  try {
    product = await Product.create({ ...data, photos })
  } catch (err) {
    // the product was not saved: do not leave its images in Cloudinary
    await deleteImages(photos.map((p) => p.public_id), deleteImage)
    throw err
  }

  res.status(201).json({
    success: true,
    message: "Product created",
    product,
  })
})

/******************************************************
 * @Update_PRODUCT
 * @route PUT /api/product/:id   (ADMIN only)
 * @description to update a product. Only the fields you send are changed.
 * New image files (field "photos") are ADDED to the photos the product already has (max 5 in total).
 * @parameters id (in URL); any of name, price, description, stock, collectionId (in body); photos (files)
 * @returns updated product
 ******************************************************/

export const updateProduct = asyncHandler(async (req, res) => {
  const { id: productId } = req.params

  const files = req.files ?? []
  const data = readProductInput(req.body, false, files.length > 0)

  if (data.collectionId) {
    await checkCollectionExists(data.collectionId)
  }

  const filter = { _id: productId }
  if (files.length) {
    // the product must exist and must have room, BEFORE we upload anything
    const existing = await Product.findById(productId).select("photos").lean()
    if (!existing) {
      throw new CustomError("Product not found", 404)
    }
    checkImageFiles(files, existing.photos?.length ?? 0)

    // safety net if two requests add photos at the same time:
    // the database itself only updates when (current photos + new photos) <= 5
    filter.$expr = { $lte: [{ $add: [{ $size: { $ifNull: ["$photos", []] } }, files.length] }, MAX_IMAGES] }
  }

  const newPhotos = files.length ? await uploadAllOrRollback(files, uploadImageBuffer, deleteImage) : []

  // $set changes the text fields, $push ADDS the new photos to the old ones
  const update = {}
  if (Object.keys(data).length) update.$set = data
  if (newPhotos.length) update.$push = { photos: { $each: newPhotos } }

  let product
  try {
    product = await Product.findOneAndUpdate(
      filter,
      update,
      // returnDocument "after" = give back the updated document (the old "new: true" is deprecated)
      { returnDocument: "after", runValidators: true }
    )
  } catch (err) {
    await deleteImages(newPhotos.map((p) => p.public_id), deleteImage)
    throw err
  }

  if (!product) {
    // the product was not changed: remove the images we just uploaded
    await deleteImages(newPhotos.map((p) => p.public_id), deleteImage)
    if (!(await Product.exists({ _id: productId }))) {
      throw new CustomError("Product not found", 404)
    }
    throw new CustomError(`A product can have at most ${MAX_IMAGES} photos`, 400)
  }

  res.status(200).json({
    success: true,
    message: "Product updated",
    product,
  })
})

/******************************************************
 * @Delete_PRODUCT
 * @route DELETE /api/product/:id   (ADMIN only)
 * @description to delete a product
 * @parameters id (in URL)
 * @returns success message
 ******************************************************/

export const deleteProduct = asyncHandler(async (req, res) => {
  const { id: productId } = req.params

  const product = await Product.findByIdAndDelete(productId)

  if (!product) {
    throw new CustomError("Product not found", 404)
  }

  // delete its images from Cloudinary. A Cloudinary problem is only logged, it never blocks the delete.
  await deleteImages((product.photos ?? []).map((p) => p.public_id), deleteImage)

  res.status(200).json({
    success: true,
    message: "Product deleted",
  })
})

/******************************************************
 * @Remove_PRODUCT_PHOTO
 * @route DELETE /api/product/:id/photo?public_id=...   (ADMIN only)
 * @description remove ONE photo from a product (from the product AND from Cloudinary)
 * @parameters id (in URL); public_id (in query string), or photoId (query) for old photos without a public_id
 * @returns updated product
 ******************************************************/

export const removeProductPhoto = asyncHandler(async (req, res) => {
  const { id: productId } = req.params
  const { public_id: publicId, photoId } = req.query

  // exactly one of them, and both must be plain text (not arrays or objects)
  const hasPublicId = typeof publicId === "string" && publicId.trim() !== "" && publicId.length <= 300
  const hasPhotoId = typeof photoId === "string" && isValidObjectId(photoId)
  if (hasPublicId === hasPhotoId) {
    throw new CustomError("Send exactly one query parameter: public_id (or photoId for an old photo without public_id)", 400)
  }

  const product = await Product.findById(productId).select("photos")
  if (!product) {
    throw new CustomError("Product not found", 404)
  }

  const photo = product.photos.find((p) => (hasPublicId ? p.public_id === publicId : String(p._id) === photoId))
  if (!photo) {
    throw new CustomError("Photo not found on this product", 404)
  }

  // 1. remove it from the product first (this is what customers see)
  const updated = await Product.findByIdAndUpdate(
    productId,
    { $pull: { photos: { _id: photo._id } } },
    { returnDocument: "after" }
  )

  // 2. then delete it from Cloudinary. If that fails it is only logged (an orphan image is harmless).
  const failed = await deleteImages([photo.public_id], deleteImage)

  res.status(200).json({
    success: true,
    message: failed ? "Photo removed from the product (Cloudinary delete failed, see server log)" : "Photo removed",
    product: updated,
  })
})

/******************************************************
 * @Get_ALL_PRODUCTS
 * @route GET /api/product   (public)
 * @description list products with filters and pages
 * @parameters (all optional, in the query string)
 *   search      part of the name (upper/lower case ignored)
 *   collectionId, minPrice, maxPrice
 *   sort        newest (default) | price_asc | price_desc
 *   page        default 1
 *   limit       default 10, max 50
 * @returns total, page, pages, count, products
 ******************************************************/

export const getAllProducts = asyncHandler(async (req, res) => {
  await sendProductList(req, res)
})

/******************************************************
 * @Get_PRODUCTS_OF_ONE_COLLECTION
 * @route GET /api/product/collection/:collectionId   (public)
 * @description same as the list above, but only for one collection
 * @parameters collectionId (in URL) + the same optional query filters
 * @returns total, page, pages, count, products
 ******************************************************/

export const getProductsByCollection = asyncHandler(async (req, res) => {
  const { collectionId } = req.params

  if (!(await Collection.exists({ _id: collectionId }))) {
    throw new CustomError("Collection not found", 404)
  }

  await sendProductList(req, res, collectionId)
})

/******************************************************
 * @Get_SINGLE_PRODUCT
 * @route GET /api/product/:id   (public)
 * @description one product, with the name of its collection
 * @parameters id (in URL)
 * @returns product
 ******************************************************/

export const getSingleProduct = asyncHandler(async (req, res) => {
  const { id: productId } = req.params

  const product = await Product.findById(productId).populate("collectionId", "name")

  if (!product) {
    throw new CustomError("Product not found", 404)
  }

  res.status(200).json({
    success: true,
    product,
  })
})
