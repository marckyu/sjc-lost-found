/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2310041328")

  // update collection data
  unmarshal({
    "listRule": "userId = @request.auth.id || @request.auth.role = \"admin\"",
    "viewRule": "userId = @request.auth.id || @request.auth.role = \"admin\""
  }, collection)

  // remove field
  collection.fields.removeById("text2453626734")

  // remove field
  collection.fields.removeById("text937750755")

  // remove field
  collection.fields.removeById("email932949261")

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2310041328")

  // update collection data
  unmarshal({
    "listRule": "claimantId = @request.auth.id || @request.auth.role = \"admin\"",
    "viewRule": "claimantId = @request.auth.id || @request.auth.role = \"admin\""
  }, collection)

  // add field
  collection.fields.addAt(2, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text2453626734",
    "max": 0,
    "min": 0,
    "name": "claimantId",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(3, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text937750755",
    "max": 0,
    "min": 0,
    "name": "claimantName",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(4, new Field({
    "exceptDomains": [],
    "help": "",
    "hidden": false,
    "id": "email932949261",
    "name": "claimantEmail",
    "onlyDomains": [],
    "presentable": false,
    "required": true,
    "system": false,
    "type": "email"
  }))

  return app.save(collection)
})
