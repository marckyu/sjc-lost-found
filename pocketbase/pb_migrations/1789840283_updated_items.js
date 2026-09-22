/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_710432678")

  // update field
  collection.fields.addAt(2, new Field({
    "help": "",
    "hidden": false,
    "id": "select105650625",
    "maxSelect": 0,
    "name": "category",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "gadgets",
      "books",
      "ids",
      "wallets",
      "keys",
      "clothing",
      "documents ",
      "others",
      "location",
      " description",
      " status verified",
      " userName",
      " userEmail",
      " userId",
      " images"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_710432678")

  // update field
  collection.fields.addAt(2, new Field({
    "help": "",
    "hidden": false,
    "id": "select105650625",
    "maxSelect": 0,
    "name": "category",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "gadgets",
      "books",
      "ids",
      "wallets",
      "keys",
      "clothing",
      "documents ",
      "others"
    ]
  }))

  return app.save(collection)
})
