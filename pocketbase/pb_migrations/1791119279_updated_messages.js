/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2605467279")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\"",
    "listRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2605467279")

  // update collection data
  unmarshal({
    "createRule": "senderId = @request.auth.id",
    "listRule": "senderId = @request.auth.id || receiverId = @request.auth.id",
    "viewRule": "senderId = @request.auth.id || receiverId = @request.auth.id"
  }, collection)

  return app.save(collection)
})
