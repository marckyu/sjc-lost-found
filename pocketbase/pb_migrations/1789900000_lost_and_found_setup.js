/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // ===== USERS =====
  const users = app.findCollectionByNameOrId("_pb_users_auth_")

  users.createRule =
    "@request.body.email ~ '%@phinmaed.com' && @request.body.role:isset = false"
  users.updateRule = "id = @request.auth.id && @request.body.role:isset = false"
  users.listRule = "id = @request.auth.id"
  users.viewRule = "id = @request.auth.id"

  const pw = users.fields.getByName("password")
  if (pw) pw.min = 6

  app.save(users)

  // ===== ITEMS =====
  const items = app.findCollectionByNameOrId("items")

  const category = items.fields.getByName("category")
  category.values = [
    "gadgets", "books", "ids", "wallets",
    "keys", "clothing", "documents", "others",
  ]

  const images = items.fields.getByName("images")
  images.maxSelect = 5
  images.maxSize = 10 * 1024 * 1024
  images.mimeTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"]

  if (!items.fields.getByName("verifiedAt")) {
    items.fields.add(new Field({ name: "verifiedAt", type: "date" }))
  }

  items.listRule = ""
  items.viewRule = ""
  items.createRule =
    '@request.auth.id != "" && @request.body.userId = @request.auth.id' +
    " && @request.body.verified:isset = false && @request.body.verifiedAt:isset = false"
  items.updateRule = '@request.auth.role = "admin"'
  items.deleteRule = '@request.auth.role = "admin"'

  app.save(items)

  // ===== NOTIFICATIONS =====
  let existing = null
  try {
    existing = app.findCollectionByNameOrId("notifications")
  } catch (_) {}

  if (!existing) {
    const notifications = new Collection({
      type: "base",
      name: "notifications",
      listRule: "userId = @request.auth.id",
      viewRule: "userId = @request.auth.id",
      createRule: '@request.auth.role = "admin"',
      updateRule: null,
      deleteRule: '@request.auth.role = "admin"',
      fields: [
        { name: "userId", type: "text", required: true, max: 50 },
        { name: "itemId", type: "text", required: true, max: 50 },
        { name: "message", type: "text", required: true, max: 1000 },
        { name: "read", type: "bool" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    app.save(notifications)
  }
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("notifications"))
  } catch (_) {}
})