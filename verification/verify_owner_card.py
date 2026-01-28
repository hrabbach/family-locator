from playwright.sync_api import sync_playwright, Page, expect
import os
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
    page.on("pageerror", lambda msg: print(f"PAGE ERROR: {msg}"))

    # Mock API
    def handle_locations(route):
        print("Handling locations request")
        time.sleep(0.2)
        route.fulfill(status=200, content_type="application/json", body='{"locations": [{"email": "member@test.com", "latitude": 10, "longitude": 10, "battery": 80, "timestamp": 1700000000, "email_initial": "M"}]}')

    def handle_owner(route):
        print("Handling owner request")
        time.sleep(0.2)
        route.fulfill(status=200, content_type="application/json", body='[{"timestamp": 1700000000, "battery": 90, "lat": 11, "lon": 11, "battery_status": "charging"}]')

    page.route("**/api/v1/families/locations*", handle_locations)
    page.route("**/api/v1/points*", handle_owner)

    # Set Config
    page.goto("file:///app/index.html")
    page.evaluate("""
        localStorage.setItem('family_tracker_config', JSON.stringify({
            baseUrl: 'https://api',
            apiKey: 'key',
            apiUserName: 'Owner User'
        }));
    """)

    print("Reloading page...")
    # Reload to apply config and start tracking
    page.reload()

    # Wait for Owner Card
    print("Waiting for Owner User...")
    try:
        # Expect the owner name to be visible
        expect(page.get_by_text("Owner User")).to_be_visible(timeout=5000)
        print("Owner card found!")
    except Exception as e:
        print(f"Owner card not found: {e}")
        # Take screenshot of failure
        page.screenshot(path="/app/verification/failure.png")

    # Take screenshot
    page.screenshot(path="/app/verification/verification.png")

    browser.close()

if __name__ == "__main__":
    with sync_playwright() as playwright:
        run(playwright)
