routerAdd("POST", "/api/password-reset-lookup", (c) => {
    const data = $apis.requestInfo(c).data;
    const email = (data.email || "").toLowerCase().trim();

    if (!email) {
        return c.json(400, { error: "Email required" });
    }

    try {
        const user = $app.findAuthRecordByEmail("users", email);
        if (user) {
            return c.json(200, {
                exists: true,
                userId: user.id,
                fullname: user.getString("fullname"),
                email: user.getString("email")
            });
        }
    } catch (err) {
        // User not found — normal, treat as not exists
    }

    return c.json(200, { exists: false });
});