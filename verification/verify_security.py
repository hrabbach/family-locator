from playwright.sync_api import sync_playwright, expect

def verify_security(page):
    # Navigate to the app
    page.goto("http://localhost:8080/index.html")

    # Check title to ensure load
    expect(page).to_have_title("Family Locator")

    # Check for CSP meta tag
    csp_meta = page.locator('meta[http-equiv="Content-Security-Policy"]')
    expect(csp_meta).to_have_count(1)
    content = csp_meta.get_attribute("content")
    print(f"CSP Content: {content}")

    # Check if html5-qrcode script is loaded
    # We can check if Html5Qrcode is defined in window
    # Note: It might load asynchronously if not deferred, but here it is a blocking script?
    # Actually it is just <script src="...">.
    # We'll wait for it?
    try:
        page.wait_for_function("typeof Html5Qrcode !== 'undefined'", timeout=5000)
        print("Html5Qrcode loaded successfully.")
    except:
        print("Html5Qrcode NOT loaded. Check CSP/SRI.")

    # Check for console errors (CSP violations)
    page.on("console", lambda msg: print(f"Console: {msg.text}"))
    page.on("pageerror", lambda exc: print(f"Page Error: {exc}"))

    # Wait a bit for UI to settle
    page.wait_for_timeout(1000)

    # Screenshot
    page.screenshot(path="verification/security_check.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_security(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
