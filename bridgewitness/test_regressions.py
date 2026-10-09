"""Behavior checks beyond the historical golden numbers: python -m unittest bridgewitness.test_regressions."""
import asyncio
import hashlib
import json
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

from .algos import assess_release, e_mean, pair_and_ledger, risk_score
from .live_tail import check
from .ml import AuthModel, ExploitTyper, CLF_FEATS, TYPES, delay_features, synth_training


def event(kind='withdrawal', ts=2, msg='1', amount='100', recipient='alice', **extra):
    return dict(kind=kind, ts=ts, msg_id=msg, amount=amount, recipient=recipient,
                route='r', token='t', event_id=f'{kind}:{ts}:{msg}', **extra)


class RuleChecks(unittest.TestCase):
    def setUp(self):
        self.dep = event('deposit', 1)

    def test_exact_authorization(self):
        self.assertEqual(assess_release(event(), [self.dep], [], True)[:2], ('consistent', None))

    def test_unrelated_message_cannot_borrow_backing(self):
        self.assertEqual(assess_release(event(msg='other'), [self.dep], [], True)[:2], ('violation', 'missing_source_deposit'))

    def test_wrong_route_cannot_borrow_backing(self):
        self.assertEqual(assess_release({**event(), 'route': 'other'}, [self.dep], [], True)[1], 'missing_source_deposit')

    def test_replay_consumption(self):
        prior = {**event(), 'matched': self.dep['event_id'], 'status': 'consistent'}
        self.assertEqual(assess_release(event(ts=3), [self.dep], [prior], True)[1], 'message_replayed')

    def test_one_wei_change(self):
        self.assertEqual(assess_release(event(amount='101'), [self.dep], [], True)[1], 'amount_mismatch')

    def test_wrong_recipient(self):
        self.assertEqual(assess_release(event(recipient='bob'), [self.dep], [], True)[1], 'recipient_mismatch')

    def test_missing_coverage_abstains(self):
        self.assertEqual(assess_release(event(), [], [])[0], 'unknown')

    def test_unfinalized_abstains(self):
        self.assertEqual(assess_release({**event(), 'finalized': False}, [], [], True)[0], 'pending')

    def test_ambiguous_authorization(self):
        self.assertEqual(assess_release(event(), [self.dep, self.dep], [], True)[0], 'unknown')

    def test_future_deposit_cannot_retroactively_back_release(self):
        ev = pd.DataFrame([event(ts=1), event('deposit', ts=2), event(ts=3)])
        result = pair_and_ledger(ev, lambda w: (np.zeros(len(w)), np.ones(len(w)) * 99), True)
        self.assertEqual(result['status'], ['violation', 'deposit', 'consistent'])

    def test_timing_cannot_invalidate_backing(self):
        ev = pd.DataFrame([self.dep, event(ts=1000)])
        result = pair_and_ledger(ev, lambda w: (np.zeros(len(w)), np.ones(len(w)) * 10), True)
        self.assertEqual(result['status'][1], 'consistent')
        self.assertEqual(result['rule'][1], 'outside_usual_delay')

    def test_integer_boundary(self):
        for amount in ['-1', '1.5', str(2**256), 'NaN']:
            with self.assertRaises(ValueError):
                assess_release(event(amount=amount), [], [], True)


class RiskChecks(unittest.TestCase):
    def test_proof_survives_quiet_statistics(self):
        self.assertGreaterEqual(risk_score('violation', 'message_replayed', None, 1)['total'], 70)

    def test_whale_is_not_exploit(self):
        self.assertLess(risk_score('consistent', None, 1e9, 1e-6, 20, True)['total'], 70)

    def test_exposure_changes_priority(self):
        self.assertGreater(risk_score('violation', 'missing_source_deposit', 1e6, 1)['total'],
                           risk_score('violation', 'missing_source_deposit', 1, 1)['total'])

    def test_unknown_cannot_be_raised_by_ml(self):
        self.assertEqual(risk_score('unknown', None, 1e9, 1e-8, 30, True)['total'], 0)

    def test_breakdown_is_bounded_and_adds_up(self):
        b = risk_score('violation', 'message_replayed', 1e30, 1e-6, 20)
        self.assertEqual(b['total'], min(100, sum(b[k] for k in ['base', 'exposure', 'campaign', 'behavior'])))

    def test_invalid_p_values_cannot_manufacture_evidence(self):
        self.assertEqual(e_mean([None, np.nan, -1, 0, 2]), (None, None))


class MLChecks(unittest.TestCase):
    def test_simulation_uses_ronin_delay_features(self):
        r = pd.DataFrame(dict(ts=[1000], feed=['ronin'], token=['0x12345678'], value_usd=[1]))
        sim = r.copy(); sim['feed'] = 'simulated'
        pd.testing.assert_frame_equal(delay_features(r), delay_features(sim))

    def test_auth_inference_is_independent_of_other_rows(self):
        tr = pd.DataFrame(dict(quorum=['a', 'b'] * 20, n_signers=[5, 9] * 20,
                               id_jump=np.arange(40), value_usd=np.arange(40), ts=np.arange(40) + 1000))
        m = AuthModel().fit(tr)
        missing = tr.iloc[:1].copy(); missing['quorum'] = None
        single = m.score(missing)[0]
        together = m.score(pd.concat([missing, tr.iloc[:10]], ignore_index=True))[0]
        self.assertAlmostEqual(single, together)

    def test_classifier_uses_disjoint_test_and_obeys_rule(self):
        base = pd.DataFrame(np.zeros((20, len(CLF_FEATS))), columns=CLF_FEATS)
        X, y = synth_training(base, n_per=50)
        m = ExploitTyper().fit(X, y)
        self.assertEqual(sum(m.report[k] for k in ['n_train', 'n_calibration', 'n_test']), len(X))
        probes = base.iloc[:3].copy(); probes.loc[0, 'amount_mismatch'] = 1
        probes.loc[1, 'recipient_mismatch'] = 1; probes.loc[2, 'unbacked'] = 1
        cls, probs = m.predict(probes)
        self.assertEqual(TYPES[cls[0]], 'amount_mismatch')
        self.assertEqual(TYPES[cls[1]], 'recipient_mismatch')
        self.assertNotIn(TYPES[cls[2]], ['benign_burst', 'benign_whale', 'key_compromise'])
        np.testing.assert_allclose(probs.sum(axis=1), 1)

    def test_streaming_features_do_not_see_the_future(self):
        from .pipeline import stream_signals
        def rows(values):
            return pd.DataFrame([dict(ts=86400 + i*100, kind='withdrawal', msg_id=str(i), symbol='T',
                                      token='t', route='r', amount='1', value_usd=v, tx=str(i),
                                      rule=None, event_id=str(i)) for i, v in enumerate(values)])
        a = stream_signals(rows([1, 2, 3]), None)
        b = stream_signals(rows([1, 2, 3, 1e9]), None)
        np.testing.assert_allclose(a.value_vs_route, b.value_vs_route.iloc[:3])


class LiveChecks(unittest.TestCase):
    def setUp(self):
        self.d = dict(depositId=1, originChainId=1, destinationChainId=2, inputToken='a', outputToken='b',
                      status='filled', depositTxHash='dep', fillTx='fill',
                      depositBlockTimestamp='2026-10-09T00:00:00Z', fillBlockTimestamp='2026-10-09T00:00:01Z',
                      inputAmount='100', outputAmount='10000', inputPriceUsd=1, outputPriceUsd=100)

    def test_prices_cannot_prove_exploit(self):
        r = check(self.d, {(1, 'a'): ('A', 0), (2, 'b'): ('B', 0)})
        self.assertEqual(r['verdict'], 'reported_filled')
        self.assertFalse(r['backing_verified'])

    def test_missing_prices_do_not_hide_reported_fill(self):
        self.assertEqual(check(self.d, {})['verdict'], 'reported_filled')

    def test_missing_fill_reference_is_unknown(self):
        self.assertEqual(check({**self.d, 'fillTx': None}, {})['verdict'], 'unknown')

    def test_refund_is_not_overdue(self):
        self.assertEqual(check({**self.d, 'status': 'refunded'}, {})['verdict'], 'refunded')


class APIChecks(unittest.IsolatedAsyncioTestCase):
    async def test_stream_waits_full_event_time_and_sends_heartbeats(self):
        from . import api
        clock = [0.0]; waits = []
        async def sleep(n):
            clock[0] += n; waits.append(n)
        replay = {'window': [100, 200], 'events': [{'ts': 140}], 'ticks': []}
        with patch.dict(api.REPLAYS, {'test': replay}), patch.object(api.time, 'monotonic', lambda: clock[0]), patch.object(api.asyncio, 'sleep', sleep):
            response = await api.stream('test', speed=1)
            frames = [f async for f in response.body_iterator]
        self.assertEqual(waits, [15, 15, 10])
        self.assertIn(': heartbeat\n\n', frames)

    async def test_stale_live_rows_keep_original_timestamp(self):
        from . import api
        state = {'at': 0, 'successful_at': 100, 'rows': [{'verdict': 'reported_filled'}], 'error': None}
        with patch.object(api, '_live', state), patch.object(api.live_tail, 'poll', side_effect=RuntimeError('offline')):
            result = await api.live()
        self.assertEqual(result['polled_at'], 100)
        self.assertIn('stale', result['error'])

    async def test_invalid_stream_start_rejected(self):
        from . import api
        from fastapi import HTTPException
        with self.assertRaises(HTTPException):
            await api.stream('nomad', speed=60, start=0)


class ArtifactChecks(unittest.TestCase):
    def test_bundle_digest_and_rule_recompute(self):
        from .pipeline import ART
        for feed in ['nomad', 'ronin', 'simulated']:
            data = json.loads((ART / f'replay_{feed}.json').read_text(encoding='utf-8'))
            for r in data['events']:
                if r['kind'] != 'withdrawal':
                    continue
                evidence = r['evidence']; b = evidence['bundle']
                digest = hashlib.sha256(json.dumps(b, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
                self.assertEqual(digest, evidence['sha256'])
                verdict = assess_release(b['release'], b['authorizations'], b['previous_releases'], b['coverage']['source_complete'])
                self.assertEqual(verdict[0], r['status'])


if __name__ == '__main__':
    unittest.main()
