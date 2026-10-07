import asyncHandler from "../services/asyncHandler.js"
import CustomError from "../utils/customError.js"
import Collection from "../models/collection.Schema.js"
import Product from "../models/product.Schema.js"
import { checkName } from "../utils/validators.js"

// Small helpers used by create and update

// Checks the name from the request body. Returns the clean (trimmed) name or throws 400.
const readName = (body) => {
  const problem = checkName(body?.name, "Collection name")
  if (problem) {
    throw new CustomError(problem, 400)
  }
  return body.name.trim()
}

const duplicateError = (name) =>
  new CustomError(`A collection named "${name}" already exists (upper/lower case is ignored)`, 400)

// Is there ANOTHER collection with this name? Upper/lower case is ignored (strength 2).
// exceptId = the collection we are renaming (it may keep its own name).
const nameIsTaken = async (name, exceptId) => {
  const filter = { name }
  if (exceptId) filter._id = { $ne: exceptId }
  const found = await Collection.findOne(filter)
    .collation({ locale: "en", strength: 2 })
    .select("_id")
  return Boolean(found)
}

// The unique index in the model is the final safety net if two requests arrive at the same time.
// Mongo then throws error 11000, and we turn it into the same clear message.
const saveOrDuplicate = async (save, name) => {
  try {
    return await save()
  } catch (err) {
    if (err.code === 11000) throw duplicateError(name)
    throw err
  }
}

/******************************************************
 * @Create_COLLECTION
 * @route POST /api/collection   (ADMIN only)
 * @description to create collection
 * @parameters name (in body)
 * @returns created collection
 ******************************************************/

export const createCollection = asyncHandler(async (req, res)=>{
  const name = readName(req.body)

  if (await nameIsTaken(name)) {
    throw duplicateError(name)
  }

  //add this name to database
  const collection = await saveOrDuplicate(() => Collection.create({ name }), name)

  //send the respond to the frontend (201 = Created)
  res.status(201).json({
    success:true,
    message:"Collection created",
    collection
  })
});

/******************************************************
 * @Update_COLLECTION
 * @route PUT /api/collection/:id   (ADMIN only)
 * @description to rename a collection
 * @parameters id (in URL), name (in body)
 * @returns updated collection
 ******************************************************/

export const updateCollection = asyncHandler(async (req,res)=>{
  //existing value to be updated (the id was already checked by validateId)
  const {id: collectionId} = req.params

  // new value to be updated
  const name = readName(req.body)

  const collection = await Collection.findById(collectionId)
  if(!collection){
    throw new CustomError("Collection not found",404)
  }

  if (await nameIsTaken(name, collectionId)) {
    throw duplicateError(name)
  }

  collection.name = name
  await saveOrDuplicate(() => collection.save(), name)

  // send the response to the frontend
  // (the key used to be spelled "updatedColection"; it is now "collection", like in create)
  res.status(200).json({
    success:true,
    message:"Collection updated",
    collection
  })
})

/******************************************************
 * @delete_COLLECTION
 * @route DELETE /api/collection/:id   (ADMIN only)
 * @description to delete a collection (only when it has no products)
 * @parameters id (in URL)
 * @returns success message
 ******************************************************/

export const deleteCollection = asyncHandler(async (req,res)=>{

  const {id: collectionId} = req.params

  const collection = await Collection.findById(collectionId)
  if(!collection){
    throw new CustomError("Collection not found",404)
  }

  // do not delete a collection that still has products (they would point to nothing)
  const productCount = await Product.countDocuments({ collectionId })
  if (productCount > 0) {
    throw new CustomError(
      `Cannot delete this collection: ${productCount} product(s) still belong to it. Move or delete them first`,
      400
    )
  }

  // (the old collectionDelete.remove() does not exist in Mongoose 9, deleteOne is the way)
  await Collection.deleteOne({ _id: collectionId })

  //send the response to the frontend
  res.status(200).json({
    success:true,
    message:"Collection deleted",
  })

})

/******************************************************
 * @getALL_COLLECTION
 * @route GET /api/collection   (public)
 * @description to get all collections, newest first
 * @parameters none
 * @returns all collections (an empty list is fine, it is not an error)
 ******************************************************/

export const getAllCollection = asyncHandler(async (req,res)=>{
  const collections = await Collection.find().sort({ createdAt: -1, _id: -1 })

  //send the response to the frontend
  res.status(200).json({
    success:true,
    message:"Collections fetched",
    collections
  })
})
