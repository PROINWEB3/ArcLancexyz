import { arcTxUrl } from '../config/chain-config';
// Circle Onramp (card to USDC) and Gateway cross-chain pay handlers
// Ported verbatim from the original single-file index.html.
    // ── Feature 14: Circle Onramp Kit Handlers (Card → USDC → Arc) ──
    window.openBuyUsdcModal = function() {
      const modal = document.getElementById('buyUsdcModal');
      if (modal) modal.classList.add('visible');
      const destInput = document.getElementById('onrampDestAddr');
      if (destInput && !destInput.value) {
        destInput.value = (typeof WalletState !== 'undefined' ? WalletState.getAddr() : '') || '';
      }
      if (typeof window.updateOnrampEstimate === 'function') window.updateOnrampEstimate();
    };

    window.closeBuyUsdcModal = function() {
      const modal = document.getElementById('buyUsdcModal');
      if (modal) modal.classList.remove('visible');
    };

    window.updateOnrampEstimate = function() {
      const payAmt = parseFloat(document.getElementById('onrampPayAmount')?.value) || 0;
      const recvEl = document.getElementById('onrampReceiveAmount');
      if (recvEl) recvEl.textContent = `${payAmt.toFixed(2)} USDC`;
    };

    window.executeCardOnramp = async function() {
      const payAmt = parseFloat(document.getElementById('onrampPayAmount')?.value) || 0;
      let destAddr = document.getElementById('onrampDestAddr')?.value?.trim();
      const method = document.getElementById('onrampPaymentMethod')?.value || 'card';
      const btn = document.getElementById('onrampSubmitBtn');
      const btnText = document.getElementById('onrampSubmitBtnText');

      if (payAmt <= 0) {
        showToast('Enter a valid USD amount to purchase');
        return;
      }
      if (!destAddr && typeof WalletState !== 'undefined') {
        destAddr = WalletState.getAddr();
      }
      if (!destAddr || !destAddr.startsWith('0x') || destAddr.length !== 42) {
        showToast('Enter a valid destination Arc Testnet address');
        return;
      }

      try {
        if (btn) btn.disabled = true;
        if (btnText) btnText.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:2px;display:inline-block"></span> Processing Card with Circle…';
        showToast(`⏳ Routing $${payAmt.toFixed(2)} via Circle Onramp Kit to Arc Testnet…`);

        await new Promise(r => setTimeout(r, 2200));

        const randomTx = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map(b => b.toString(16).padStart(2, '0')).join('');

        if (typeof WalletState !== 'undefined') {
          WalletState.adjustUSDC(payAmt);
          WalletState.addTx({
            id: randomTx,
            type: 'send',
            label: `Circle Onramp: Card → ${payAmt} USDC`,
            timestamp: new Date().toISOString(),
            display: `+${payAmt.toFixed(2)} USDC`,
            hash: randomTx,
            explorerUrl: arcTxUrl(randomTx)
          });
        }

        window.closeBuyUsdcModal();
        showToast(`Purchased ${payAmt.toFixed(2)} USDC via Circle Onramp! Settled directly on Arc.`);
        
        if (typeof openReceiptModal === 'function') {
          openReceiptModal({
            amount: `${payAmt.toFixed(2)} USDC`,
            to: destAddr,
            hash: randomTx,
            date: new Date().toLocaleString()
          });
        }
      } catch (err) {
        showToast('Onramp purchase failed: ' + (err.message || err));
      } finally {
        if (btn) btn.disabled = false;
        if (btnText) btnText.textContent = 'PAY WITH CARD VIA CIRCLE';
      }
    };

    // ── Feature 13: Circle Gateway Cross-Chain Payment Handlers ──
    window.openCrossChainPayModal = function() {
      const modal = document.getElementById('crossChainPayModal');
      if (modal) modal.classList.add('visible');
      const rcpInput = document.getElementById('gatewayRecipient');
      if (rcpInput && !rcpInput.value) {
        const myUser = localStorage.getItem('arclance_my_username');
        rcpInput.value = myUser ? `@${myUser}` : ((typeof WalletState !== 'undefined' ? WalletState.getAddr() : '') || '');
      }
    };

    window.closeCrossChainPayModal = function() {
      const modal = document.getElementById('crossChainPayModal');
      if (modal) modal.classList.remove('visible');
    };

    window.executeGatewayPay = async function() {
      const chain = document.getElementById('gatewaySourceChain')?.value || 'ethereum';
      const amt = parseFloat(document.getElementById('gatewayPayAmount')?.value) || 0;
      let recipient = document.getElementById('gatewayRecipient')?.value?.trim() || '';
      const btn = document.getElementById('gatewayPayBtn');

      if (amt <= 0) {
        showToast('Enter a valid payment amount');
        return;
      }
      if (recipient.startsWith('@') || (!recipient.startsWith('0x') && typeof resolveUsername === 'function' && resolveUsername(recipient))) {
        const resolved = resolveUsername(recipient);
        if (resolved) recipient = resolved;
      }
      if (!recipient || !recipient.startsWith('0x') || recipient.length !== 42) {
        showToast('Enter a valid recipient Arc address or @username');
        return;
      }

      try {
        if (btn) btn.disabled = true;
        showToast(`⏳ Routing cross-chain payment from ${chain.toUpperCase()} via Circle Gateway unified liquidity…`);
        await new Promise(r => setTimeout(r, 2000));

        const randomTx = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map(b => b.toString(16).padStart(2, '0')).join('');

        if (typeof WalletState !== 'undefined') {
          WalletState.adjustUSDC(amt);
          WalletState.addTx({
            id: randomTx,
            type: 'send',
            label: `Circle Gateway: ${chain.toUpperCase()} → Arc (${amt} USDC)`,
            timestamp: new Date().toISOString(),
            display: `+${amt.toFixed(2)} USDC`,
            hash: randomTx,
            explorerUrl: arcTxUrl(randomTx)
          });
        }

        window.closeCrossChainPayModal();
        showToast(`Payment of ${amt.toFixed(2)} USDC received on Arc Testnet via Circle Gateway unified balance!`);
      } catch (err) {
        showToast('Gateway payment failed: ' + (err.message || err));
      } finally {
        if (btn) btn.disabled = false;
      }
    };

