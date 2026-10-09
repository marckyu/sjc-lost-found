/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_710432678")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\"",
    "listRule": "@request.auth.id != \"\"",
    "updateRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_710432678")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\" && @request.body.userId = @request.auth.id && @request.body.verified:isset = false && @request.body.verifiedAt:isset = false",
    "listRule": "",
    "updateRule": "@request.auth.role = \"admin\"",
    "viewRule": ""
  }, collection)

  return app.save(collection)
})
