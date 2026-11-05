// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title UsernameRegistry
/// @notice Permissionless on-chain username registry for ArcLance on Arc Testnet.
/// @dev Maps lowercase names (3-20 chars: a-z, 0-9, internal hyphens) to a single wallet address and back.
///      No admin/owner powers, no upgradeability, no fees, and no funds held.
contract UsernameRegistry {
    error InvalidName();
    error NameReserved();
    error NameTaken();
    error AlreadyHasName();
    error NoNameRegistered();

    event NameRegistered(address indexed owner, string name);
    event NameReleased(address indexed owner, string name);

    mapping(string => address) private _ownerOf;
    mapping(address => string) private _nameOf;
    mapping(string => bool) private _reserved;

    constructor() {
        _reserved["arc"] = true;
        _reserved["circle"] = true;
        _reserved["usdc"] = true;
        _reserved["eurc"] = true;
        _reserved["admin"] = true;
        _reserved["support"] = true;
        _reserved["arclance"] = true;
    }

    /// @notice Register an available username for msg.sender. One name per wallet.
    function register(string calldata name) external {
        _validateName(name);
        if (_reserved[name]) revert NameReserved();
        if (_ownerOf[name] != address(0)) revert NameTaken();
        if (bytes(_nameOf[msg.sender]).length != 0) revert AlreadyHasName();

        _ownerOf[name] = msg.sender;
        _nameOf[msg.sender] = name;

        emit NameRegistered(msg.sender, name);
    }

    /// @notice Release the caller's currently registered username so it becomes free again.
    function release() external {
        string memory current = _nameOf[msg.sender];
        if (bytes(current).length == 0) revert NoNameRegistered();

        delete _ownerOf[current];
        delete _nameOf[msg.sender];

        emit NameReleased(msg.sender, current);
    }

    /// @notice Resolve a username to its owner address (returns address(0) if free).
    function resolve(string calldata name) external view returns (address) {
        return _ownerOf[name];
    }

    /// @notice Return the username registered to `account` (returns "" if none).
    function nameOf(address account) external view returns (string memory) {
        return _nameOf[account];
    }

    /// @notice Check whether a name is on the constructor's reserved list.
    function isReserved(string calldata name) external view returns (bool) {
        return _reserved[name];
    }

    function _validateName(string calldata name) internal pure {
        bytes memory b = bytes(name);
        uint256 len = b.length;
        if (len < 3 || len > 20) revert InvalidName();
        if (b[0] == 0x2d || b[len - 1] == 0x2d) revert InvalidName();

        for (uint256 i = 0; i < len; ) {
            bytes1 ch = b[i];
            bool isLower = (ch >= 0x61 && ch <= 0x7a); // a-z
            bool isDigit = (ch >= 0x30 && ch <= 0x39); // 0-9
            bool isHyphen = (ch == 0x2d);              // -
            if (!isLower && !isDigit && !isHyphen) revert InvalidName();
            unchecked {
                ++i;
            }
        }
    }
}
