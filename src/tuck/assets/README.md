# Tuck v2 — paper motion kit

Open preview.html beside tuck.css and preview.js. Five states and four palettes; a dark-background switch and a motion-off control. No dependencies or network requests.

## Integration
Inline tuck.svg into your component or Shadow DOM. Load tuck.css into the same scope. Set data-state on the SVG to resting, thinking, checkin, welcome, or sleeping. An img pointing to the SVG is static.

- Resting: upright neutral pose with an occasional blink.
- Thinking: tilted pose, upward gaze, accent-coloured geometric thought bubbles.
- Check-in: two corner waves over 1.8 seconds, then a raised corner, smile, and accent-coloured greeting marks remain.
- Welcome: one small hop, smiling closed eyes and accent-coloured sparkles.
- Sleeping: tall triangular flap folds across its diagonal crease; sleepy eyes and accent-coloured Z marks remain.

Finite effects play on entering the state. They do not continuously loop. Switch to resting when your policy considers the interaction complete. Reduced motion disables animations/transitions while preserving distinct poses and effects. data-motion="off" does the same.

The fold uses a CSS reflection matrix around the flap crease with an interpolated transition; it is a stylized 2D paper fold, not a physical 3D simulation.

SVG viewBox: 280 × 260, transparent. Suggested display width: 64–80px. Override --tuck-body, --tuck-shadow, --tuck-highlight, --tuck-eyes, --tuck-accent to theme. Default accent #D6AC70.

Wrap interactive Tuck in a real button named "Open Tuck". In that context mark the SVG aria-hidden="true" and remove its role/aria-label. Announce nudge text separately. Event timing, dismissal, and policy remain the extension's responsibility.

Preview tagline: A little folded companion tucked into your browser.

Effect colour selector: Golden apricot #D6AC70 (default), Soft mint #94BFAE, Dusty rose #C994AA, Pale lilac #C4B5DB. The selector changes all effects independently of the body palette.
