const {
  ethers,
  getClient: getVaultClient,
  makeAccessToken: makeVaultAccessToken
} = require('../lib/vault');

const {
  getClient: getProtectionClient,
  makeAccessToken: makeProtectionAccessToken
} = require('../lib/protection');

const {
  verifyTxPollToken
} = require('../lib/tx');

function parseNamedEvent(
  receipt,
  contract,
  name
) {
  for (
    const log of receipt.logs || []
  ) {
    try {
      const parsed =
        contract.interface.parseLog(
          log
        );

      if (
        parsed &&
        parsed.name === name
      ) {
        return parsed;
      }

    } catch (_) {}
  }

  return null;
}

async function txStatus(
  req,
  res
) {
  const {
    txHash,
    kind,
    pollToken
  } = req.body || {};

  if (
    !/^0x[0-9a-fA-F]{64}$/.test(
      txHash || ''
    )
  ) {
    return res
      .status(400)
      .json({
        error:
          'txHash 형식이 올바르지 않습니다.'
      });
  }

  if (
    !verifyTxPollToken(
      txHash,
      pollToken
    )
  ) {
    return res
      .status(403)
      .json({
        error:
          '트랜잭션 상태 조회 토큰이 올바르지 않습니다.'
      });
  }

  const vault =
    getVaultClient();

  const receipt =
    await vault.provider
      .getTransactionReceipt(
        txHash
      );

  // 아직 블록에 포함되지 않음
  if (!receipt) {
    return res
      .status(200)
      .json({
        status: 'pending',
        txHash
      });
  }

  // 실제 트랜잭션 실패
  if (
    Number(receipt.status) === 0
  ) {
    return res
      .status(200)
      .json({
        status: 'failed',
        txHash,
        blockNumber:
          receipt.blockNumber
      });
  }

  const out = {
    status: 'success',
    txHash,
    blockNumber:
      receipt.blockNumber
  };

  // 사후 전달 최초 등록
  if (kind === 'register') {
    const ev =
      parseNamedEvent(
        receipt,
        vault.contract,
        'VaultRegistered'
      );

    if (!ev) {
      return res
        .status(409)
        .json({
          error:
            'VaultRegistered 이벤트를 찾지 못했습니다.'
        });
    }

    out.vaultId =
      Number(ev.args.vaultId);

    out.accessToken =
      makeVaultAccessToken(
        out.vaultId,
        txHash
      );

  // 생전 보호 최초 생성
  } else if (
    kind ===
    'protection-create'
  ) {
    const protection =
      getProtectionClient();

    const ev =
      parseNamedEvent(
        receipt,
        protection.contract,
        'ProtectionCreated'
      );

    if (!ev) {
      return res
        .status(409)
        .json({
          error:
            'ProtectionCreated 이벤트를 찾지 못했습니다.'
        });
    }

    out.protectionId =
      Number(
        ev.args.protectionId
      );

    out.accessToken =
      makeProtectionAccessToken(
        out.protectionId
      );

  // 보호 설정 변경 요청
  } else if (
    kind ===
    'protection-change'
  ) {
    const protection =
      getProtectionClient();

    const ev =
      parseNamedEvent(
        receipt,
        protection.contract,
        'ProtectionChangeRequested'
      );

    if (!ev) {
      return res
        .status(409)
        .json({
          error:
            'ProtectionChangeRequested 이벤트를 찾지 못했습니다.'
        });
    }

    out.executeAfter =
      Number(
        ev.args.executeAfter
      );
  }

  return res
    .status(200)
    .json(out);
}

module.exports =
async function handler(
  req,
  res
) {
  res.setHeader(
    'Cache-Control',
    'no-store'
  );

  try {

    // POST는 새 API 파일을 만들지 않고
    // 이 health 함수에서 tx 상태 확인
    if (req.method === 'POST') {
      return await txStatus(
        req,
        res
      );
    }

    if (req.method !== 'GET') {
      return res
        .status(405)
        .json({
          error:
            'METHOD_NOT_ALLOWED'
        });
    }

    const {
      provider,
      wallet,
      contract,
      contractAddress
    } =
      getVaultClient();

    const [
      network,
      balance,
      verifier
    ] =
      await Promise.all([
        provider.getNetwork(),
        provider.getBalance(
          wallet.address
        ),
        contract.verifier()
      ]);

    let protection = {
      configured:
        Boolean(
          process.env
            .IEUM_PROTECTION_CONTRACT_ADDRESS
        ),
      ok: false
    };

    if (
      process.env
        .IEUM_PROTECTION_CONTRACT_ADDRESS
    ) {
      try {
        const p =
          getProtectionClient();

        const [
          operator,
          delay
        ] =
          await Promise.all([
            p.contract.operator(),
            p.contract.changeDelay()
          ]);

        protection = {
          configured: true,
          ok: true,
          contractAddress:
            p.contractAddress,
          contractOperator:
            operator,
          operatorMatchesWallet:
            operator
              .toLowerCase() ===
            p.wallet.address
              .toLowerCase(),
          changeDelaySeconds:
            Number(delay)
        };

      } catch (error) {
        console.error(
          'Protection health error:',
          error
        );

        protection = {
          configured: true,
          ok: false,
          error:
            error?.message ||
            '생전 보호 상태 확인에 실패했습니다.'
        };
      }
    }

    return res
      .status(200)
      .json({
        ok: true,
        network: 'Sepolia',
        chainId:
          Number(
            network.chainId
          ),
        walletAddress:
          wallet.address,
        balanceETH:
          ethers.formatEther(
            balance
          ),
        contractAddress,
        contractVerifier:
          verifier,
        verifierMatchesWallet:
          verifier
            .toLowerCase() ===
          wallet.address
            .toLowerCase(),

        protection,

        gemini: {
          configured:
            Boolean(
              process.env
                .GEMINI_API_KEY
            ),
          model:
            process.env
              .GEMINI_MODEL ||
            'gemini-3.6-flash'
        }
      });

  } catch (error) {
    console.error(
      'Health check error:',
      error
    );

    return res
      .status(500)
      .json({
        ok: false,
        error:
          error?.message ||
          'health check failed'
      });
  }
};