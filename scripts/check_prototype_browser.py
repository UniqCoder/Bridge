"""Local UI behavior check. Start Vite on 5190 and run python scripts/check_prototype_browser.py."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True,
                                args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    for route in ['/', '/console/live', '/console/map', '/console/budget', '/console/contagion',
                  '/console/signers', '/console/pairing', '/console/evidence', '/console/results', '/docs/architecture']:
        page.goto('http://127.0.0.1:5190' + route)
        page.wait_for_timeout(700)
        assert page.locator('main').inner_text().strip(), route
        print('PAGE', route)

    # Recompute every exported verdict in the browser, not only the tamper toy.
    result = page.evaluate('''async () => {
      const {verifyEvidence} = await import('/src/live/verifyEvidence.ts');
      let checked = 0;
      for (const feed of ['nomad', 'ronin', 'simulated']) {
        const data = await (await fetch(`/data/replay_${feed}.json`)).json();
        for (const e of data.events.filter(e => e.kind === 'withdrawal')) {
          const v = await verifyEvidence(e.evidence.bundle, e.evidence.sha256);
          if (!v.integrity || v.status !== e.status) throw Error(`${feed}: ${e.id}`);
          checked++;
        }
      }
      return checked;
    }''')
    print('BROWSER EVIDENCE', result)

    page.goto('http://127.0.0.1:5190/console/evidence?feed=ronin')
    page.get_by_role('button', name='Verify original').click()
    page.get_by_role('status').filter(has_text='Digest matches').wait_for()
    page.get_by_role('button', name='Add 1 tiny unit').click()
    page.get_by_role('status').filter(has_text='Tampering detected').wait_for()
    page.get_by_role('tab', name='Honest payouts').click()
    page.get_by_role('button', name='Verify original').click()
    page.get_by_role('status').filter(has_text='exact backing checks pass').wait_for()
    page.get_by_role('button', name='Add 1 tiny unit').click()
    page.get_by_role('status').filter(has_text='amount').wait_for()
    page.get_by_role('button', name='Send it to someone else').click()
    page.get_by_role('status').filter(has_text='recipient').wait_for()
    print('EVIDENCE tamper and rule checks passed')

    page.goto('http://127.0.0.1:5190/console/live?feed=nomad')
    page.get_by_role('button', name='Skip to the attack').click()
    page.get_by_role('button', name='Play', exact=True).wait_for(timeout=15000)
    page.locator('.ac-badge').filter(has_text='EXPLOIT').wait_for()
    assert page.locator('.ac-body').inner_text().find('Priority: rule') >= 0
    assert page.locator('.live-clock').inner_text().endswith('21:32:31')
    page.get_by_role('tab', name='Ronin hack, 2022').click()
    page.get_by_role('button', name='Skip to the attack').click()
    page.get_by_role('button', name='Play', exact=True).wait_for(timeout=15000)
    page.locator('.ac-type').filter(has_text='Suspected validator key compromise').wait_for()
    print('FEED SWITCH + exact first-alert pause + risk breakdown passed')

    page.set_viewport_size({'width': 375, 'height': 820})
    page.goto('http://127.0.0.1:5190/console/evidence?feed=nomad')
    page.get_by_role('button', name='Verify original').click()
    page.get_by_role('status').filter(has_text='Digest matches').wait_for()
    (ROOT / 'docs' / 'validation').mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(ROOT/'docs/validation/evidence-mobile.png'), full_page=True)
    assert not errors, errors
    print('No browser exceptions; desktop and mobile checks passed')
    browser.close()
