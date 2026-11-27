// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./KongkowOG.sol";

/// @notice Minimal interface for the Binance Agent ID registry (SPACE ID Agent ID, ERC-721).
/// Registry on BNB Chain mainnet: 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F
interface IAgentIdRegistry {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title Kongkow
/// @notice Kongkow — the social hangout where every member is an Agent ID.
/// "Kongkow" is Indonesian slang for hanging out together.
/// @dev Design rules for the Agent ID Hackathon:
/// - Agent ID is the core identity: registration requires holding an Agent ID,
///   and every social action requires membership. One Agent ID address = one
///   member (Agent IDs are non-transferable, 1 per person).
/// - The first 50 members receive a soulbound OG badge (KongkowOG).
/// - The contract NEVER custodies user funds: there are no payable functions,
///   no token, nothing to buy or sell, and no promise of returns. Project
///   boards in this version are social spaces only (no funding pools).
/// - Owner powers are limited to pause/unpause (documented in README).
contract Kongkow is Ownable, Pausable, ReentrancyGuard {
    uint256 public constant OG_LIMIT = 50;
    uint256 public constant MAX_POST_LENGTH = 280;
    uint256 public constant MAX_PROJECT_NAME_LENGTH = 64;
    uint256 public constant MAX_PROJECT_DESC_LENGTH = 280;

    IAgentIdRegistry public immutable agentIdRegistry;
    KongkowOG public immutable ogBadge;

    struct Member {
        bool registered;
        uint64 memberNo;
        uint64 joinedAt;
        bool isOG;
        uint256 postCount;
        uint256 followerCount;
        uint256 followingCount;
    }

    struct Post {
        address author;
        string text;
        uint64 createdAt;
        uint256 likeCount;
    }

    struct Project {
        address creator;
        string name;
        string description;
        uint64 createdAt;
        uint256 memberCount;
    }

    uint256 public memberCount;
    uint256 public projectCount;
    address[] public memberList;
    Post[] public posts;
    Project[] public projects;

    mapping(address => Member) public members;
    mapping(uint256 => mapping(address => bool)) public postLiked;
    mapping(address => mapping(address => bool)) public isFollowing;
    mapping(uint256 => mapping(address => bool)) public projectJoined;

    event Registered(address indexed member, uint256 memberNo, bool isOG);
    event PostCreated(uint256 indexed postId, address indexed author);
    event PostLiked(uint256 indexed postId, address indexed member);
    event Followed(address indexed follower, address indexed target);
    event Unfollowed(address indexed follower, address indexed target);
    event ProjectCreated(
        uint256 indexed projectId,
        address indexed creator,
        string name
    );
    event ProjectJoined(uint256 indexed projectId, address indexed member);

    modifier onlyMember() {
        require(members[msg.sender].registered, "Not a member");
        _;
    }

    constructor(address registry) Ownable(msg.sender) {
        require(registry != address(0), "Registry required");
        agentIdRegistry = IAgentIdRegistry(registry);
        ogBadge = new KongkowOG();
    }

    // ------------------------------------------------------------ members --
    /// @notice Register as a member. Requires holding an Agent ID.
    /// The first 50 members also receive the soulbound OG badge.
    function register() external whenNotPaused nonReentrant {
        require(
            agentIdRegistry.balanceOf(msg.sender) > 0,
            "Agent ID required"
        );
        require(!members[msg.sender].registered, "Already registered");

        uint256 no = memberCount++;
        bool og = no < OG_LIMIT;
        members[msg.sender] = Member({
            registered: true,
            memberNo: uint64(no),
            joinedAt: uint64(block.timestamp),
            isOG: og,
            postCount: 0,
            followerCount: 0,
            followingCount: 0
        });
        memberList.push(msg.sender);
        if (og) ogBadge.mint(msg.sender, no);
        emit Registered(msg.sender, no, og);
    }

    function isRegistered(address user) external view returns (bool) {
        return members[user].registered;
    }

    /// @notice Paginated member directory, in registration order.
    function getMembers(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory page) {
        uint256 total = memberList.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = memberList[i];
        }
    }

    // -------------------------------------------------------------- posts --
    function createPost(
        string calldata text
    ) external whenNotPaused onlyMember {
        uint256 len = bytes(text).length;
        require(len > 0 && len <= MAX_POST_LENGTH, "Post length 1-280");
        uint256 id = posts.length;
        posts.push(
            Post({
                author: msg.sender,
                text: text,
                createdAt: uint64(block.timestamp),
                likeCount: 0
            })
        );
        members[msg.sender].postCount++;
        emit PostCreated(id, msg.sender);
    }

    function likePost(uint256 postId) external whenNotPaused onlyMember {
        require(postId < posts.length, "No such post");
        require(!postLiked[postId][msg.sender], "Already liked");
        postLiked[postId][msg.sender] = true;
        posts[postId].likeCount++;
        emit PostLiked(postId, msg.sender);
    }

    function postCount() external view returns (uint256) {
        return posts.length;
    }

    /// @notice Paginated posts, in creation order (oldest first).
    function getPosts(
        uint256 offset,
        uint256 limit
    )
        external
        view
        returns (
            address[] memory authors,
            string[] memory texts,
            uint256[] memory createdAts,
            uint256[] memory likeCounts
        )
    {
        uint256 total = posts.length;
        if (offset >= total) {
            return (
                new address[](0),
                new string[](0),
                new uint256[](0),
                new uint256[](0)
            );
        }
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 n = end - offset;
        authors = new address[](n);
        texts = new string[](n);
        createdAts = new uint256[](n);
        likeCounts = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            Post storage p = posts[offset + i];
            authors[i] = p.author;
            texts[i] = p.text;
            createdAts[i] = p.createdAt;
            likeCounts[i] = p.likeCount;
        }
    }

    // ------------------------------------------------------------ follows --
    function follow(address target) external whenNotPaused onlyMember {
        require(members[target].registered, "Target not a member");
        require(target != msg.sender, "Cannot follow yourself");
        require(!isFollowing[msg.sender][target], "Already following");
        isFollowing[msg.sender][target] = true;
        members[msg.sender].followingCount++;
        members[target].followerCount++;
        emit Followed(msg.sender, target);
    }

    function unfollow(address target) external whenNotPaused onlyMember {
        require(isFollowing[msg.sender][target], "Not following");
        isFollowing[msg.sender][target] = false;
        members[msg.sender].followingCount--;
        members[target].followerCount--;
        emit Unfollowed(msg.sender, target);
    }

    // ----------------------------------------------------------- projects --
    /// @notice Create a project board. The creator auto-joins as member #1.
    function createProject(
        string calldata name,
        string calldata description
    ) external whenNotPaused onlyMember {
        uint256 nameLen = bytes(name).length;
        require(nameLen > 0 && nameLen <= MAX_PROJECT_NAME_LENGTH, "Name 1-64");
        require(
            bytes(description).length <= MAX_PROJECT_DESC_LENGTH,
            "Description too long"
        );
        uint256 id = projects.length;
        projects.push(
            Project({
                creator: msg.sender,
                name: name,
                description: description,
                createdAt: uint64(block.timestamp),
                memberCount: 1
            })
        );
        projectJoined[id][msg.sender] = true;
        projectCount++;
        emit ProjectCreated(id, msg.sender, name);
    }

    function joinProject(uint256 projectId) external whenNotPaused onlyMember {
        require(projectId < projects.length, "No such project");
        require(!projectJoined[projectId][msg.sender], "Already joined");
        projectJoined[projectId][msg.sender] = true;
        projects[projectId].memberCount++;
        emit ProjectJoined(projectId, msg.sender);
    }

    /// @notice Paginated project boards, in creation order.
    function getProjects(
        uint256 offset,
        uint256 limit
    )
        external
        view
        returns (
            address[] memory creators,
            string[] memory names,
            string[] memory descriptions,
            uint256[] memory createdAts,
            uint256[] memory memberCounts
        )
    {
        uint256 total = projects.length;
        if (offset >= total) {
            return (
                new address[](0),
                new string[](0),
                new string[](0),
                new uint256[](0),
                new uint256[](0)
            );
        }
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 n = end - offset;
        creators = new address[](n);
        names = new string[](n);
        descriptions = new string[](n);
        createdAts = new uint256[](n);
        memberCounts = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            Project storage p = projects[offset + i];
            creators[i] = p.creator;
            names[i] = p.name;
            descriptions[i] = p.description;
            createdAts[i] = p.createdAt;
            memberCounts[i] = p.memberCount;
        }
    }

    // -------------------------------------------------------------- admin --
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
