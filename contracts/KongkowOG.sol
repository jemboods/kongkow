// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title KongkowOG
/// @notice Soulbound OG badge for the first 50 members of Kongkow.
/// @dev Minted only by the Kongkow contract (the owner). Transfers are
/// permanently disabled: the badge is a proof of early membership, never a
/// tradable asset. Token ids equal the member numbers (0..49).
contract KongkowOG is ERC721, Ownable {
    error Soulbound();

    constructor() ERC721("Kongkow OG", "KOG") Ownable(msg.sender) {}

    /// @notice Mint the OG badge for `to`. Only the Kongkow contract may call.
    function mint(address to, uint256 memberNo) external onlyOwner {
        _mint(to, memberNo);
    }

    /// @dev Blocks every transfer and approval-driven move; only minting
    /// (from == address(0)) is allowed through.
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory json = string(
            abi.encodePacked(
                '{"name":"Kongkow OG #',
                Strings.toString(tokenId),
                '","description":"One of the first 50 members of Kongkow, the social hangout for Agent ID holders on BNB Chain. Soulbound: this badge can never be transferred or sold.",',
                '"attributes":[{"trait_type":"Member number","value":',
                Strings.toString(tokenId),
                '},{"trait_type":"Cohort","value":"OG - first 50"}]}'
            )
        );
        return
            string(
                abi.encodePacked(
                    "data:application/json;base64,",
                    Base64.encode(bytes(json))
                )
            );
    }
}
