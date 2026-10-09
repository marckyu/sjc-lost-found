/// <reference path="../pb_data/types.d.ts" />

onRecordAfterCreateSuccess((e) => {
    const record = e.record;
    const app = e.app;

    console.log("=== NEW MATCH CREATED — SENDING EMAIL ===");

    const lostItemId = record.get("lostItemId");
    const foundItemId = record.get("foundItemId");
    const confidenceScore = record.get("confidenceScore");
    const matchReason = record.get("matchReason");

    let lostItem, foundItem;
    try {
        lostItem = app.findRecordById("items", lostItemId);
        foundItem = app.findRecordById("items", foundItemId);
    } catch (err) {
        console.log("Failed to find items:", err);
        return;
    }

    let lostUser, foundUser;
    try {
        lostUser = app.findRecordById("users", lostItem.get("userId"));
        foundUser = app.findRecordById("users", foundItem.get("userId"));
    } catch (err) {
        console.log("Failed to find users:", err);
        return;
    }

    const lostEmail = lostUser.get("email");
    const foundEmail = foundUser.get("email");
    const lostName = lostUser.get("fullname") || "User";
    const foundName = foundUser.get("fullname") || "User";

    const lostItemName = lostItem.get("itemName");
    const foundItemName = foundItem.get("itemName");
    const lostLocation = lostItem.get("location");
    const foundLocation = foundItem.get("location");

    console.log("Sending email to: " + lostEmail + " and " + foundEmail);

    const isSameUser = lostEmail === foundEmail;
    const greeting = isSameUser
        ? lostName
        : lostName + " and " + foundName;

    const subject = "Potential Match Found — " + lostItemName;

    const htmlBody = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f0fdf4;">
            <div style="background: linear-gradient(135deg, #166534, #15803d); color: #fff; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="margin: 0 0 8px 0; font-size: 24px;">AI Found a Potential Match!</h1>
                <p style="margin: 0; opacity: 0.9; font-size: 14px;">SJC Campus Lost &amp; Found</p>
            </div>

            <div style="background: #fff; padding: 30px; border-radius: 0 0 12px 12px;">
                <p style="color: #0a0a0a; font-size: 15px; margin-bottom: 20px;">
                    Hi <strong>${greeting}</strong>,
                </p>

                <p style="color: #333; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
                    AI found a potential match between your reports with
                    <strong>${confidenceScore}% confidence</strong>.
                </p>

                <div style="background: #f0fdf4; border-left: 4px solid #166534; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                    <h3 style="margin: 0 0 12px 0; color: #166534; font-size: 16px;">Match Details</h3>

                    <div style="margin-bottom: 10px;">
                        <p style="margin: 0 0 4px 0; font-size: 12px; color: #666; text-transform: uppercase; font-weight: 700;">LOST ITEM</p>
                        <p style="margin: 0; font-size: 14px; color: #0a0a0a;"><strong>${lostItemName}</strong></p>
                        <p style="margin: 2px 0 0 0; font-size: 13px; color: #666;">Location: ${lostLocation}</p>
                    </div>

                    <div style="text-align: center; color: #166534; font-size: 20px; margin: 8px 0;">&darr;&uarr;</div>

                    <div>
                        <p style="margin: 0 0 4px 0; font-size: 12px; color: #666; text-transform: uppercase; font-weight: 700;">FOUND ITEM</p>
                        <p style="margin: 0; font-size: 14px; color: #0a0a0a;"><strong>${foundItemName}</strong></p>
                        <p style="margin: 2px 0 0 0; font-size: 13px; color: #666;">Location: ${foundLocation}</p>
                    </div>

                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #dcfce7;">
                        <p style="margin: 0; font-size: 12px; color: #666;">
                            <strong>Reason:</strong> ${matchReason}
                        </p>
                    </div>
                </div>

                <p style="color: #333; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
                    Visit the <strong>SJC Lost &amp; Found</strong> website to confirm the match and chat with the other user.
                </p>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="http://localhost:5173/items.html"
                       style="display: inline-block; background: linear-gradient(135deg, #166534, #15803d); color: #fff; padding: 14px 32px; border-radius: 25px; text-decoration: none; font-weight: 800; font-size: 15px;">
                        View Match &rarr;
                    </a>
                </div>

                <p style="color: #999; font-size: 12px; line-height: 1.5; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                    If this is not your item, click <strong>"Not My Item"</strong> on the website to dismiss the match.
                </p>
            </div>

            <p style="text-align: center; color: #999; font-size: 11px; margin-top: 20px;">
                &copy; 2026 SJC Campus Lost &amp; Found — Automated message, please do not reply.
            </p>
        </div>
    `;

    const plainBody = "AI Found a Potential Match!\n\nHi " + greeting + ",\n\nAI found a " + confidenceScore + "% match between your reports:\n\nLOST: " + lostItemName + " (" + lostLocation + ")\nFOUND: " + foundItemName + " (" + foundLocation + ")\n\nReason: " + matchReason + "\n\nVisit the SJC Lost & Found website to confirm and chat.\n\n(c) 2026 SJC Campus Lost & Found";

    const message = new MailerMessage({
        from: {
            address: app.settings().meta.senderAddress,
            name: app.settings().meta.senderName,
        },
        to: [
            { address: lostEmail },
            { address: foundEmail },
        ],
        subject: subject,
        html: htmlBody,
        text: plainBody,
    });

    try {
        app.newMailClient().send(message);
        console.log("SUCCESS: Match email sent to " + lostEmail + " and " + foundEmail);
    } catch (err) {
        console.log("ERROR: Failed to send match email:", err);
    }

    e.next();
}, "matches");