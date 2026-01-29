from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto("http://localhost:8080")
        page.wait_for_selector("#configView")
        page.screenshot(path="verification/verification.png")
        print("Screenshot taken")
        browser.close()

if __name__ == "__main__":
    run()
