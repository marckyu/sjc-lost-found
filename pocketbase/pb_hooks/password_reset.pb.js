/// <reference path="../pb_data/types.d.ts" />

routerAdd("POST", "/api/password-reset-lookup", (c) => {
    const data = $apis.requestInfo(c).data;
    const email = (data.email || "").toLowerCase().trim();

    if (!email) {
        return c.json(400, { error: "Email required" });
    }

    try {
        // Hanapin ang user
        const user = $app.findAuthRecordByEmail("users", email);
        
        if (user) {
            // 1. Gumawa ng random na 8-character na temporary password
            const tempPassword = $security.randomString(8);
            
            // 2. I-set ang bagong password sa user at i-save sa database
            user.setPassword(tempPassword);
            $app.save(user);

            // 3. Gumawa ng email message
            const message = new MailerMessage({
                from: {
                    address: $app.settings().meta.senderAddress,
                    name: $app.settings().meta.senderName,
                },
                to: [{ address: email }],
                subject: "SJC Lost & Found - Password Reset",
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 10px;">
                        <h2 style="color: #166534;">Password Reset Request</h2>
                        <p>Hi <strong>${user.getString("fullname") || "User"}</strong>,</p>
                        <p>We received a request to reset your password. Here is your temporary password:</p>
                        <div style="background: #f0fdf4; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0; border: 1px solid #bbf7d0;">
                            <h3 style="margin: 0; color: #166534; letter-spacing: 2px;">${tempPassword}</h3>
                        </div>
                        <p>Please log in using this temporary password and change it immediately in your profile settings.</p>
                        <p style="color: #666; font-size: 12px; margin-top: 30px;">If you did not request this, please ignore this email.</p>
                    </div>
                `,
            });

            // 4. I-send ang email gamit ang SMTP settings sa PocketBase
            try {
                $app.newMailClient().send(message);
                console.log("SUCCESS: Password reset email sent to " + email);
            } catch (err) {
                console.log("ERROR: Failed to send password reset email:", err);
            }
        }
    } catch (err) {
        // User not found — sadyang hindi tayo mag-e-error para sa security
        console.log("Password reset requested for non-existent user: " + email);
    }

    // 5. Palaging same response (Para hindi ma-hack/enumerate ang users)
    return c.json(200, { 
        message: "If an account exists, a reset email has been sent." 
    });
});