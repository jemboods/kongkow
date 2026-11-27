const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Kongkow", function () {
  let mock, kongkow, badge, owner, alice, bob, carol, dave;

  beforeEach(async function () {
    [owner, alice, bob, carol, dave] = await ethers.getSigners();
    const Mock = await ethers.getContractFactory("MockAgentId");
    mock = await Mock.deploy();
    const Kongkow = await ethers.getContractFactory("Kongkow");
    kongkow = await Kongkow.deploy(await mock.getAddress());
    const Badge = await ethers.getContractFactory("KongkowOG");
    badge = Badge.attach(await kongkow.ogBadge());
  });

  async function register(user) {
    await mock.mint(user.address);
    return kongkow.connect(user).register();
  }

  describe("registration", function () {
    it("reverts without an Agent ID", async function () {
      await expect(kongkow.connect(alice).register()).to.be.revertedWith(
        "Agent ID required"
      );
    });

    it("registers a member and assigns member number 0", async function () {
      await expect(register(alice))
        .to.emit(kongkow, "Registered")
        .withArgs(alice.address, 0, true);
      const m = await kongkow.members(alice.address);
      expect(m.registered).to.equal(true);
      expect(m.memberNo).to.equal(0);
      expect(m.isOG).to.equal(true);
      expect(await kongkow.memberCount()).to.equal(1);
    });

    it("reverts on double registration", async function () {
      await register(alice);
      await expect(kongkow.connect(alice).register()).to.be.revertedWith(
        "Already registered"
      );
    });

    it("mints the OG badge to the first member, owned by Kongkow only", async function () {
      await register(alice);
      expect(await badge.ownerOf(0)).to.equal(alice.address);
      expect(await badge.owner()).to.equal(await kongkow.getAddress());
      const uri = await badge.tokenURI(0);
      expect(uri).to.match(/^data:application\/json;base64,/);
    });

    it("gives badges to exactly the first 50 members", async function () {
      this.timeout(120000);
      const funder = owner;
      for (let i = 0; i < 51; i++) {
        const w = ethers.Wallet.createRandom().connect(ethers.provider);
        await funder.sendTransaction({
          to: w.address,
          value: ethers.parseEther("0.01"),
        });
        await mock.mint(w.address);
        await kongkow.connect(w).register();
        if (i < 50) {
          expect(await badge.balanceOf(w.address)).to.equal(1);
        } else {
          expect(await badge.balanceOf(w.address)).to.equal(0);
          const m = await kongkow.members(w.address);
          expect(m.isOG).to.equal(false);
          expect(m.memberNo).to.equal(50);
        }
      }
      expect(await kongkow.memberCount()).to.equal(51);
    });

    it("badge is soulbound: transfers revert", async function () {
      await register(alice);
      await expect(
        badge.connect(alice).transferFrom(alice.address, bob.address, 0)
      ).to.be.revertedWithCustomError(badge, "Soulbound");
    });

    it("paginates the member directory", async function () {
      await register(alice);
      await register(bob);
      await register(carol);
      const page = await kongkow.getMembers(1, 2);
      expect(page).to.deep.equal([bob.address, carol.address]);
      expect(await kongkow.getMembers(5, 2)).to.deep.equal([]);
    });
  });

  describe("posts and likes", function () {
    beforeEach(async function () {
      await register(alice);
      await register(bob);
    });

    it("non-members cannot post", async function () {
      await expect(kongkow.connect(carol).createPost("gm")).to.be.revertedWith(
        "Not a member"
      );
    });

    it("creates a post and counts it", async function () {
      await expect(kongkow.connect(alice).createPost("gm kongkow"))
        .to.emit(kongkow, "PostCreated")
        .withArgs(0, alice.address);
      expect(await kongkow.postCount()).to.equal(1);
      const p = await kongkow.posts(0);
      expect(p.author).to.equal(alice.address);
      expect(p.text).to.equal("gm kongkow");
    });

    it("rejects empty and over-long posts", async function () {
      await expect(kongkow.connect(alice).createPost("")).to.be.revertedWith(
        "Post length 1-280"
      );
      await expect(
        kongkow.connect(alice).createPost("x".repeat(281))
      ).to.be.revertedWith("Post length 1-280");
    });

    it("likes a post exactly once per member", async function () {
      await kongkow.connect(alice).createPost("hello");
      await expect(kongkow.connect(bob).likePost(0))
        .to.emit(kongkow, "PostLiked")
        .withArgs(0, bob.address);
      const p = await kongkow.posts(0);
      expect(p.likeCount).to.equal(1);
      await expect(kongkow.connect(bob).likePost(0)).to.be.revertedWith(
        "Already liked"
      );
    });

    it("returns paginated posts", async function () {
      await kongkow.connect(alice).createPost("one");
      await kongkow.connect(bob).createPost("two");
      const [authors, texts] = await kongkow.getPosts(0, 10);
      expect(authors).to.deep.equal([alice.address, bob.address]);
      expect(texts).to.deep.equal(["one", "two"]);
    });
  });

  describe("follows", function () {
    beforeEach(async function () {
      await register(alice);
      await register(bob);
    });

    it("follows and unfollows with counts", async function () {
      await kongkow.connect(alice).follow(bob.address);
      let a = await kongkow.members(alice.address);
      let b = await kongkow.members(bob.address);
      expect(a.followingCount).to.equal(1);
      expect(b.followerCount).to.equal(1);
      await kongkow.connect(alice).unfollow(bob.address);
      a = await kongkow.members(alice.address);
      b = await kongkow.members(bob.address);
      expect(a.followingCount).to.equal(0);
      expect(b.followerCount).to.equal(0);
    });

    it("rejects self-follow and double follow", async function () {
      await expect(kongkow.connect(alice).follow(alice.address)).to.be.revertedWith(
        "Cannot follow yourself"
      );
      await kongkow.connect(alice).follow(bob.address);
      await expect(kongkow.connect(alice).follow(bob.address)).to.be.revertedWith(
        "Already following"
      );
    });

    it("rejects following a non-member", async function () {
      await expect(kongkow.connect(alice).follow(carol.address)).to.be.revertedWith(
        "Target not a member"
      );
    });
  });

  describe("project boards", function () {
    beforeEach(async function () {
      await register(alice);
      await register(bob);
    });

    it("creates a project and auto-joins the creator", async function () {
      await expect(
        kongkow.connect(alice).createProject("Sowcial", "farming game")
      )
        .to.emit(kongkow, "ProjectCreated")
        .withArgs(0, alice.address, "Sowcial");
      const p = await kongkow.projects(0);
      expect(p.memberCount).to.equal(1);
      expect(await kongkow.projectJoined(0, alice.address)).to.equal(true);
      expect(await kongkow.projectCount()).to.equal(1);
    });

    it("lets other members join exactly once", async function () {
      await kongkow.connect(alice).createProject("Proj", "desc");
      await kongkow.connect(bob).joinProject(0);
      const p = await kongkow.projects(0);
      expect(p.memberCount).to.equal(2);
      await expect(kongkow.connect(bob).joinProject(0)).to.be.revertedWith(
        "Already joined"
      );
    });

    it("rejects bad project inputs", async function () {
      await expect(kongkow.connect(alice).createProject("", "d")).to.be.revertedWith(
        "Name 1-64"
      );
      await expect(
        kongkow.connect(alice).createProject("ok", "x".repeat(281))
      ).to.be.revertedWith("Description too long");
    });
  });

  describe("pause", function () {
    it("owner can pause and unpause; register blocked while paused", async function () {
      await mock.mint(alice.address);
      await kongkow.pause();
      await expect(kongkow.connect(alice).register()).to.be.revertedWithCustomError(
        kongkow,
        "EnforcedPause"
      );
      await kongkow.unpause();
      await kongkow.connect(alice).register();
      expect(await kongkow.memberCount()).to.equal(1);
    });

    it("non-owner cannot pause", async function () {
      await expect(kongkow.connect(alice).pause()).to.be.revertedWithCustomError(
        kongkow,
        "OwnableUnauthorizedAccount"
      );
    });
  });
});
