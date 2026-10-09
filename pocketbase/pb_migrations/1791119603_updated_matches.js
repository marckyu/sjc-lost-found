/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2541054544")

  // update collection data
  unmarshal({
    "updateRule": "@request.auth.id != \"\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2541054544")

  // update collection data
  unmarshal({
    "updateRule": "@request.auth.role = \"admin\""
  }, collection)

  return app.save(collection)
})
