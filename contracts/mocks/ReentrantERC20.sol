// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// Test-only malicious token. When armed, the next transfer calls back into `target` with `data`
/// (a re-entrancy attempt) and records whether it succeeded and what it returned. Never deploy.
contract ReentrantERC20 is ERC20 {
    address public target;
    bytes public data;
    bool public armed;
    bool public attempted;
    bool public lastSuccess;
    bytes public lastReturn;

    constructor() ERC20("Reentrant", "REENT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(address target_, bytes calldata data_) external {
        target = target_;
        data = data_;
        armed = true;
        attempted = false;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed && from != address(0) && to != address(0)) {
            armed = false;
            attempted = true;
            (bool ok, bytes memory ret) = target.call(data);
            lastSuccess = ok;
            lastReturn = ret;
        }
    }
}
