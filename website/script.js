// Final Whistle — shared interactions

(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasViewTimeline = window.CSS && CSS.supports && CSS.supports('animation-timeline: view()');

  // Scroll reveal fallback — only needed where the browser can't do it in pure CSS
  if (!reduceMotion && !hasViewTimeline && 'IntersectionObserver' in window) {
    document.body.classList.add('js-reveal');
    var revealTargets = document.querySelectorAll('.feature, .step, .receipt');
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    revealTargets.forEach(function (el) { revealObserver.observe(el); });
  }

  // Count-up animation for the stat strip (numbers are already correct in the HTML,
  // this only adds the counting motion — nothing breaks if it doesn't run)
  var stats = document.querySelectorAll('.stat .num');
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var statObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var target = parseInt(el.textContent.trim(), 10);
        if (isNaN(target)) return;
        var duration = 900;
        var startTime = null;

        function step(ts) {
          if (!startTime) startTime = ts;
          var progress = Math.min((ts - startTime) / duration, 1);
          el.textContent = Math.floor(progress * target);
          if (progress < 1) requestAnimationFrame(step);
          else el.textContent = target;
        }
        requestAnimationFrame(step);
        statObserver.unobserve(el);
      });
    }, { threshold: 0.4 });
    stats.forEach(function (el) { statObserver.observe(el); });
  }
})();

// Wallet connection — works with any wallet injecting window.solana
// (Phantom, Solflare, Backpack, and most others follow this same standard).
// No external library needed for a simple connect/disconnect flow.
(function () {
  var btn = document.getElementById('connectWalletBtn');
  if (!btn) return;

  var connectedAddress = null;

  function getProvider() {
    return window.solana || window.solflare || window.backpack || null;
  }

  function shortenAddress(addr) {
    return addr.slice(0, 4) + '\u2026' + addr.slice(-4);
  }

  function setConnectedUI(address) {
    connectedAddress = address;
    btn.textContent = shortenAddress(address);
    btn.classList.add('wallet-connected');
    btn.title = 'Connected: ' + address + ' (click to disconnect)';
  }

  function setDisconnectedUI() {
    connectedAddress = null;
    btn.textContent = 'Connect wallet';
    btn.classList.remove('wallet-connected');
    btn.title = '';
  }

  async function connectWallet() {
    var provider = getProvider();

    if (!provider) {
      window.open('https://phantom.app/', '_blank', 'noopener');
      return;
    }

    var originalText = btn.textContent;
    try {
      btn.textContent = 'Connecting\u2026';
      var resp = await provider.connect();
      setConnectedUI(resp.publicKey.toString());
    } catch (err) {
      console.error('Wallet connection failed or was rejected:', err);
      btn.textContent = originalText;
    }
  }

  function disconnectWallet() {
    var provider = getProvider();
    if (provider && typeof provider.disconnect === 'function') {
      provider.disconnect();
    }
    setDisconnectedUI();
  }

  btn.addEventListener('click', function () {
    if (connectedAddress) {
      disconnectWallet();
    } else {
      connectWallet();
    }
  });

  // Silently try to restore a previously-trusted connection after a page
  // refresh. onlyIfTrusted means this never pops up a prompt — it just
  // resolves quietly if the site was already approved, or fails quietly
  // if not (which is expected and not an error).
  (async function tryEagerConnect() {
    var provider = getProvider();
    if (!provider) return;
    try {
      var resp = await provider.connect({ onlyIfTrusted: true });
      setConnectedUI(resp.publicKey.toString());
    } catch (err) {
      // Not previously trusted — normal, just stay disconnected until clicked.
    }
  })();
})();

// Market stake buttons (markets.html) — honest demo feedback, real staking
// wires to the deployed Anchor program in the next build.
// Market stake buttons (markets.html) — builds and sends a REAL on-chain
// stake transaction to our deployed devnet program when the wallet is
// connected. Falls back to an honest prompt if not connected.
(function () {
  var sideButtons = document.querySelectorAll('.side-btn');
  if (!sideButtons.length) return;

  var PROGRAM_ID_STR = 'GmpCe863ZJD1WrbPAg1Di3Bgfg7CGaR1NGGyBJejMWji';
  var DEVNET_RPC = 'https://api.devnet.solana.com';
  var STAKE_AMOUNT_SOL = 0.01;
  var LAMPORTS_PER_SOL = 1000000000;

  // Anchor discriminator for our program's `stake` instruction
  // (first 8 bytes of sha256("global:stake"))
  var STAKE_DISCRIMINATOR = new Uint8Array([206, 176, 202, 18, 200, 209, 179, 108]);

  // Must exactly match the fixtures created by init_markets.ts
  var MARKET_CONFIG = {
    'Argentina': { fixtureId: 1, side: 0 },
    'Draw': { fixtureId: 1, side: 1 },
    'Brazil': { fixtureId: 1, side: 2 },
    'Over 2.5': { fixtureId: 2, side: 0 },
    'Under 2.5': { fixtureId: 2, side: 1 },
  };

  function isWalletConnected() {
    var walletBtn = document.getElementById('connectWalletBtn');
    return walletBtn && walletBtn.classList.contains('wallet-connected');
  }

  function getProvider() {
    return window.solana || window.solflare || window.backpack || null;
  }

  function u64Bytes(amount) {
    var buf = new Uint8Array(8);
    new DataView(buf.buffer).setBigUint64(0, BigInt(amount), true);
    return buf;
  }

  function concatBytes(arrays) {
    var total = arrays.reduce(function (sum, a) { return sum + a.length; }, 0);
    var result = new Uint8Array(total);
    var offset = 0;
    arrays.forEach(function (a) { result.set(a, offset); offset += a.length; });
    return result;
  }

  async function realStake(side, note) {
    if (typeof solanaWeb3 === 'undefined') {
      note.textContent = 'Solana library did not load \u2014 check your connection and refresh.';
      return;
    }
    var marketConfig = MARKET_CONFIG[side];
    if (!marketConfig) {
      note.textContent = 'Unknown market side.';
      return;
    }
    var provider = getProvider();
    if (!provider || !provider.publicKey) {
      note.textContent = 'Connect your wallet above first.';
      return;
    }

    try {
      note.textContent = 'Building transaction\u2026';

      var programId = new solanaWeb3.PublicKey(PROGRAM_ID_STR);
      var connection = new solanaWeb3.Connection(DEVNET_RPC, 'confirmed');

      var fixtureIdBuf = u64Bytes(marketConfig.fixtureId);
      var marketSeed = [new TextEncoder().encode('market'), fixtureIdBuf];
      var marketPda = solanaWeb3.PublicKey.findProgramAddressSync(marketSeed, programId)[0];
      var vaultSeed = [new TextEncoder().encode('vault'), marketPda.toBuffer()];
      var vaultPda = solanaWeb3.PublicKey.findProgramAddressSync(vaultSeed, programId)[0];
      var positionSeed = [new TextEncoder().encode('position'), marketPda.toBuffer(), provider.publicKey.toBuffer()];
      var positionPda = solanaWeb3.PublicKey.findProgramAddressSync(positionSeed, programId)[0];

      var amountLamports = Math.round(STAKE_AMOUNT_SOL * LAMPORTS_PER_SOL);
      var data = concatBytes([
        STAKE_DISCRIMINATOR,
        new Uint8Array([marketConfig.side]),
        u64Bytes(amountLamports),
      ]);

      var ix = new solanaWeb3.TransactionInstruction({
        programId: programId,
        keys: [
          { pubkey: provider.publicKey, isSigner: true, isWritable: true },
          { pubkey: marketPda, isSigner: false, isWritable: true },
          { pubkey: vaultPda, isSigner: false, isWritable: true },
          { pubkey: positionPda, isSigner: false, isWritable: true },
          { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: data,
      });

      var tx = new solanaWeb3.Transaction().add(ix);
      var latestBlockhash = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = latestBlockhash.blockhash;
      tx.feePayer = provider.publicKey;

      note.textContent = 'Approve the transaction in your wallet\u2026';

      var txSig;
      if (provider.signAndSendTransaction) {
        var result = await provider.signAndSendTransaction(tx);
        txSig = result.signature || result;
      } else {
        var signedTx = await provider.signTransaction(tx);
        txSig = await connection.sendRawTransaction(signedTx.serialize());
      }

      note.innerHTML = 'Staked ' + STAKE_AMOUNT_SOL + ' SOL on "' + side + '". <a href="https://explorer.solana.com/tx/' +
        txSig + '?cluster=devnet" target="_blank" rel="noopener">View transaction</a> (confirming\u2026)';

      await connection.confirmTransaction({
        signature: txSig,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      }, 'confirmed');

      note.innerHTML = 'Staked ' + STAKE_AMOUNT_SOL + ' SOL on "' + side + '". <a href="https://explorer.solana.com/tx/' +
        txSig + '?cluster=devnet" target="_blank" rel="noopener">View confirmed transaction</a>';
    } catch (err) {
      console.error('Stake failed:', err);
      var message = (err && err.message) ? err.message : 'see browser console for details';
      note.textContent = 'Stake failed: ' + message;
    }
  }

  sideButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card = btn.closest('.market-card');
      var note = card ? card.querySelector('[data-note]') : null;
      if (!note) return;
      var side = btn.getAttribute('data-side');

      if (isWalletConnected()) {
        realStake(side, note);
      } else {
        note.textContent = 'Connect your wallet above to stake on "' + side + '".';
      }
    });
  });
})();
