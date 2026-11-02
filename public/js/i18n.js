/**
 * MiniChess i18n — Internationalization Engine (TR / EN)
 * Persistent language switcher and natural chess/esports terminology
 */
(function() {
  'use strict';

  const STORAGE_KEY = 'minichess_lang';

  const TRANSLATIONS = {
    en: {
      // Navigation
      nav_play: 'Play',
      nav_leaderboard: 'Leaderboard',
      nav_battlepass: 'Battlepass',
      nav_shop: 'Shop',
      nav_profile: 'Profile',
      nav_admin: 'Admin',
      sign_out: 'Sign Out',
      create_account: 'Create Account',
      badge_guest: 'GUEST',
      badge_unranked: 'Unranked',
      or_divider: '— OR —',
      play_as_guest: 'Play as Guest',
      guest_create_account: 'Create Account',
      guest_prompt_title: 'Guest Mode',
      guest_shop_prompt: 'Please create an account to purchase shop items and save your progress!',
      guest_battlepass_prompt: 'Create an account to claim Battlepass rewards and save your progress!',
      guest_login_required: 'Log in to access',
      guest_login_required_desc: 'You must log in to access this page.',
      guest_restricted_title: 'Log in to access',
      guest_restricted_desc: 'You can only access Battlepass, Shop, and Profile pages if you are logged in. Create an account or log in now!',
      back_to_lobby: 'Back to Lobby',

      // Common
      loading: 'Loading...',
      cancel: 'Cancel',
      close: 'Close',
      save: 'Save',
      copied: 'Copied!',
      link_copied: 'Link copied!',

      // Stats
      stat_w: 'W',
      stat_l: 'L',
      stat_d: 'D',
      stat_wins: 'Wins',
      stat_losses: 'Losses',
      stat_draws: 'Draws',
      stat_win_rate: 'Win Rate',
      current_elo: 'Current ELO',
      welcome_back: 'Welcome back',

      // Login page
      login_heading: 'Welcome Back',
      login_subtitle: 'Log in to your MiniChess account',
      username_label: 'Username',
      username_placeholder: 'Enter your username',
      password_label: 'Password',
      password_placeholder: 'Enter your password',
      login_btn: 'Log In to Play',
      new_to_minichess: 'New to MiniChess?',
      badge_tactical_blitz: '6×6 Tactical Blitz',
      hero_tagline: 'Fast, Tactical Crazyhouse',
      hero_tagline_desc: 'Capture opponent pieces to your pocket, drop them on any square, and checkmate fast.',
      ticker_duels: 'Fast-paced Minichess Duels',
      ticker_leaderboards: 'Climb the Global Leaderboards',
      ticker_bots: 'Challenge Advanced Bots',
      ticker_customizations: 'Unlock Premium Customizations',

      // Register page
      register_heading: 'Create Account',
      register_subtitle: 'Join MiniChess and start playing',
      confirm_password_label: 'Confirm Password',
      confirm_password_placeholder: 'Confirm your password',
      register_btn: 'Create Account',
      already_account: 'Already have an account?',
      log_in: 'Log In',

      // Lobby
      hero_welcome_prefix: 'Welcome back,',
      hero_subtitle: 'Choose your game mode and start playing',
      rejoin_game: 'Rejoin Game',
      game_in_progress: 'Game in Progress',
      tab_multiplayer: 'Multiplayer',
      tab_vs_computer: 'Vs Computer',
      tab_play_friend: 'Play a Friend',
      mode_ranked_title: 'Ranked 6x6',
      mode_ranked_desc: 'Competitive crazyhouse duel with ELO rating at stake',
      mode_dice_title: 'Dice Minichess',
      mode_dice_desc: 'Chaotic rules: roll a dice to determine piece moves',
      find_match: 'Find Match',
      searching_opponent: 'Searching for Opponent...',
      in_queue: 'In Queue',
      cancel_queue: 'Cancel',
      players_in_queue: 'in queue',
      online_players: 'online',
      bot_heading: 'Practice vs Computer',
      bot_subtitle: 'Select an AI opponent and sharpen your tactical play',
      filter_all: 'All',
      filter_easy: 'Easy',
      filter_medium: 'Medium',
      filter_hard: 'Hard',
      filter_expert: 'Expert',
      btn_play_bot: 'Play vs Computer',
      friend_heading: 'Play with a Friend',
      friend_subtitle: 'Create a private room or enter a friend\'s room code',
      btn_create_room: 'Create Private Room',
      waiting_friend: 'Waiting for friend to join...',
      room_link_label: 'Share this link with a friend:',
      copy_link_btn: 'Copy Link',
      or_join_room: 'OR JOIN A ROOM',
      room_code_placeholder: 'Enter room code or link...',
      btn_join_room: 'Join Room',
      daily_quests: 'Daily Quests',
      top_players: 'Top Players',
      recent_activity: 'Recent Activity',
      view_all: 'View Full Leaderboard',
      view_battlepass: 'View Battlepass',
      no_quests: 'No quests available',
      no_activity: 'No recent activity yet',

      // Game
      your_pocket: 'Your Pocket',
      opponents_pocket: "Opponent's Pocket",
      moves: 'Moves',
      no_moves_yet: 'No moves yet',
      game_starting: 'Game starting...',
      your_turn: 'Your Turn',
      opponents_turn: "Opponent's Turn",
      draw: 'Draw',
      draw_offered: 'Draw Offered',
      resign: 'Resign',
      leave: 'Leave',
      skip_turn: 'Skip Turn',
      roll: 'Roll',
      crazyhouse_pockets: 'Crazyhouse Pockets',
      crazyhouse_desc: 'Captured pieces become pocket pieces. Select or drag from your pocket to drop them onto empty squares.',
      move_review: 'Move Review',
      move_review_desc: 'Use ← / → on your keyboard, or the buttons below, to review the game.',
      replay: 'Replay',
      victory: 'VICTORY!',
      defeat: 'DEFEAT',
      game_draw: 'DRAW',
      white_wins: 'White Wins!',
      black_wins: 'Black Wins!',
      play_again: 'Play Again',
      back_to_lobby: 'Back to Lobby',
      rematch: 'Rematch',
      review_game: 'Review Game',
      check: 'Check!',
      checkmate: 'Checkmate!',
      stalemate: 'Stalemate!',
      draw_agreement: 'Draw by agreement',
      timeout: 'Time out!',
      opponent_resigned: 'Opponent resigned!',
      opponent_disconnected: 'Opponent disconnected',

      // Profile
      profile_title: 'Player Profile',
      profile_edit_avatar: 'Click to change avatar',
      member_since: 'Member since',
      stats_title: 'Statistics',
      game_history: 'Game History',
      achievements: 'Achievements',
      friends: 'Friends',
      add_friend: 'Add Friend',
      friend_username_placeholder: 'Enter username...',
      send_request: 'Send Request',
      pending: 'Pending',
      pending_requests: 'Pending Requests',
      no_friends: 'No friends yet',
      no_history: 'No games played yet',
      play_a_match: 'Play a Match',
      accept: 'Accept',
      decline: 'Decline',
      remove: 'Remove',

      // Shop
      shop_title: 'Cosmetic Shop',
      shop_subtitle: 'Customize your board, victory effects, and player card',
      board_themes: 'Board Themes',
      win_effects: 'Win Effects',
      name_colors: 'Name Colors',
      buy: 'Buy',
      owned: 'Owned',
      equipped: 'Equipped',
      equip: 'Equip',
      unequip: 'Unequip',
      coins: 'Coins',
      free: 'Free',

      // Battlepass
      battlepass_title: 'Battlepass',
      season: 'Season',
      tier: 'Tier',
      tiers: 'Tiers',
      current_tier: 'Current Tier',
      claim: 'Claim',
      claimed: 'Claimed',
      locked: 'Locked',
      unlocked: 'Unlocked',
      unlocked_titles: 'Unlocked Titles',

      // Leaderboard
      leaderboard_title: 'Global Leaderboard',
      leaderboard_subtitle: 'Top ranking MiniChess grandmasters',
      rank: 'Rank',
      player: 'Player',
      rating: 'Rating',
      // Additional UI & Lobby terms
      find_a_match: 'Find a Match',
      cancel_search: 'Cancel Search',
      singleplayer_vs_computer: 'Singleplayer — vs Computer',
      all_levels: 'All Levels',
      beginner: 'Beginner',
      intermediate: 'Intermediate',
      expert_master: 'Expert / Master',
      play_vs: 'Play vs',
      join_room_code: 'Join with Room Code',
      join_room_desc: 'Enter room code or shared link to join a private duel immediately.',
      enter_room_code: 'Enter room code or link...',
      join: 'Join',
      create_private_room: 'Create Private Room',
      create_room_desc: 'Open a private board, send the invite link to a friend, and start playing.',
      share_link_friend: 'Share this link with a friend:',
      copy: 'Copy',
      cancel_room: 'Cancel Room',
      daily_quests_battlepass: 'Daily Quests & Battlepass',
      view_pass: 'View Pass',
      full_board: 'Full Board',
      record: 'Record',
      fast_tactical_grid: 'Fast Tactical Grid',
      fast_tactical_grid_desc: '6×6 Mini Board',
      dynamic_blitz: 'Dynamic Blitz',
      increment_2_5: '2+5 Increment',
      deploy_captures: 'Deploy Captures',
      crazyhouse_drops: 'Crazyhouse Drops',
      competitive_ladder: 'Competitive Ladder',
      ranked_elo: 'Ranked ELO',
      how_minihouse_works: 'How Minihouse Works:',
      minihouse_how_desc: 'Captured pieces enter your pocket. On your turn, drop any pocket piece directly onto any empty square instead of moving!',
      community_feed: 'Community Feed',
      loading_activities: 'Loading live activities...',
      drop_master: 'Drop Master',
      drop_master_desc: 'Drop 4 captured pieces onto the board',
      tactical_victory: 'Tactical Victory',
      tactical_victory_desc: 'Win 2 rated multiplayer matches',
      ai_warmup: 'AI Warmup',
      ai_warmup_desc: 'Checkmate any computer bot',
      done: 'Done',
      founders_season: 'Founders Season',
      founders_season_desc: 'Play games, earn XP, and unlock exclusive titles. Every match counts!',
      your_titles: 'Your Titles',
      click_claim_title: '— Click Claim to collect your title',
      no_titles_unlocked: "You haven't unlocked any titles yet. Keep playing to earn them!",
      loading_tiers: 'Loading tiers...',
      equipped_title: 'Equipped Title:',
      none: 'None',
      loading_shop_items: 'Loading shop items...',
      no_items_category: 'No items available in this category.',
      // Sound & Mute Toggle
      sound: 'Sound',
      sound_toggle: 'Sound Effects',
      sound_muted: 'Sound Muted',
      sound_unmuted: 'Sound Enabled',
      mute_sound: 'Mute Sound',
      unmute_sound: 'Unmute Sound',
      unmute: 'Unmute',
      // Resign & Draw Modals
      resign_modal_title: 'Resign Match',
      resign_confirm_msg: 'Are you sure you want to resign this match? This cannot be undone.',
      yes_resign: 'Yes, Resign',
      draw_modal_title: 'Offer Draw',
      draw_confirm_msg: 'Are you sure you want to offer a draw to your opponent?',
      yes_offer_draw: 'Yes, Offer Draw',
      draw_received_title: 'Draw Offer',
      draw_received_msg: 'Your opponent is offering a draw. Do you accept?',
      accept_draw: 'Accept',
      decline_draw: 'Decline',
      draw_cancelled: 'Draw offer cancelled',
      draw_declined: 'Draw offer declined',
      draw_offered_waiting: 'Draw offered — waiting...',
      draw_cancelled_by_opponent: 'Draw offer cancelled by opponent',
      // Daily Quests
      quest_1_title: 'Complete 1 Match Today',
      quest_1_desc: 'Play and finish at least 1 match',
      quest_2_title: 'Drop 2 Pieces (Crazyhouse Drop)',
      quest_2_desc: 'Drop 2 captured pieces onto the board',
      quest_3_title: 'Defeat a Computer Bot',
      quest_3_desc: 'Win a game against any AI bot',
      claim_reward: 'Claim Reward',
      claim: 'Claim',
      claimed: 'Claimed',
      quest_completed: 'Quest Completed!',
      reward_claimed_toast: 'Battlepass XP added!',
      // Live Matches & Spectator
      live_matches: 'Live Matches',
      live_matches_desc: 'Watch ongoing tactical duels in real-time',
      spectate: 'Spectate',
      spectating_live: 'Spectating Live',
      spectators: 'spectators',
      spectator_count: 'Spectators',
      no_live_matches: 'No active matches right now. Jump into a game!',
      spectator_mode: 'Spectator Mode',
      spectator_banner_hint: 'Live spectator view — controls disabled',
      // Daily Streak
      daily_login_streak: '7-Day Login Streak',
      daily_streak_sub: 'Log in daily to claim escalating rewards!',
      claim_daily_reward: 'Claim Daily Reward',
      streak_claimed_today: 'Claimed Today (Come back tomorrow)',
      streak_day: 'Day',
      streak_bonus_claimed: 'Daily login reward claimed!',
      grand_prize: 'Grand Prize',
      streak_broken_notice: 'Your streak was reset because a day was missed.',
      coins: 'Coins',
      // Volume
      volume: 'Volume',
      volume_percent: 'Volume: {0}%',
      // Game additions & Spectator
      wins_suffix: 'Wins!',
      white_to_move: "White's Turn",
      black_to_move: "Black's Turn",
      white_pocket: "White's Pocket",
      black_pocket: "Black's Pocket",
      guest_streak_login_prompt: 'Please create an account to start your daily login streak and claim rewards!',
      streak_master: 'Streak Master',
      streak_master_desc: 'Complete a 7-day login streak',
      badge: 'Badge',
      // Achievements
      first_win: 'First Blood',
      first_win_desc: 'Win your first game',
      fast_mate: 'Lightning Speed',
      fast_mate_desc: 'Win in 10 moves or less',
      bot_slayer: 'Bot Slayer',
      bot_slayer_desc: 'Defeat a computer opponent',
      win_streak_10: 'Untouchable',
      win_streak_10_desc: 'Win 10 games in a row',
      pacifist: 'Pacifist',
      pacifist_desc: 'Draw a game',
      dedicated_player: 'Dedicated Player',
      dedicated_player_desc: 'Play 50 games',
      elo_1500: 'Rising Star',
      elo_1500_desc: 'Reach 1500 ELO',
      elo_2000: 'Grandmaster',
      elo_2000_desc: 'Reach 2000 ELO',
      social_butterfly: 'Social Butterfly',
      social_butterfly_desc: 'Add a friend',
      big_spender: 'Big Spender',
      big_spender_desc: 'Buy an item from the shop',
      fashionista: 'Fashionista',
      fashionista_desc: 'Change your avatar',
      connecting_server: 'Connecting to server...',
      battlepass_xp: 'Battlepass XP',
      btn_create_private_room: '+ Create Private Room',
      variant: 'Variant',
      top_players_desc: 'Global MiniChess Leaderboard',
      no_recent_activity: 'No recent activity',
      no_players_yet: 'No players yet. Be the first!',
      failed_load_leaderboard: 'Failed to load leaderboard',
      failed_load_shop: 'Failed to load shop items',
      join_private_game: 'Join Private Game',
      checking_room: 'Checking room...',
      no_tier_data: 'No tier data available.',
      empty_match_history_desc: 'Jump into matchmaking or challenge bots to build your record!',
      empty_friends_desc: 'Play matches or search for friends above to connect!',
      send_request_status: 'Sending...',
      enter_username_status: 'Enter a username',
      confirm_remove_friend: 'Are you sure you want to remove this friend?',
      time_control: 'Time Control',
      bullet_1m: '1+0 Bullet (60s)',
      blitz_3m: '3+0 Blitz (180s)',
      rapid_5m: '5+0 Rapid (300s)',
      takeback: 'Takeback',
      hint: 'Hint',
      takeback_done: 'Move taken back',
      no_takeback_available: 'No moves to take back',
      calculating_hint: 'Calculating best move...',
      hint_suggested: 'Hint: ',
      copy_fen: 'Copy FEN',
      fen_copied: 'FEN copied to clipboard!',
      review_game: 'Review Moves',
      show_result: 'Show Result',
      game_finished_review: 'Game Finished — Move Stepper',
      wait_your_turn: 'Wait for your turn',
      final_position: 'Final Position',
      move_step: 'Move',
      only_bot_takeback: 'Takeback is only available in bot matches',
      only_bot_hint: 'Hint is only available in bot matches',
      failed_copy_fen: 'Failed to copy FEN',
      no_board_state: 'No board state available',
      joining_game: 'Joining game...',
      room_has_two_players: 'This room already has two players.',
      no_room_id_provided: 'No room ID provided. Ask your friend for the correct link.',
      room_check_failed: 'Failed to check room. Please try again.',
      failed_create_room: 'Failed to create room'
    },
    tr: {
      // Navigation
      nav_play: 'Oyna',
      nav_leaderboard: 'Liderlik Tablosu',
      nav_battlepass: 'Savaş Bileti',
      nav_shop: 'Mağaza',
      nav_profile: 'Profil',
      nav_admin: 'Yönetici',
      sign_out: 'Çıkış Yap',
      create_account: 'Hesap Oluştur',
      badge_guest: 'MİSAFİR',
      badge_unranked: 'Derecesiz',
      or_divider: '— VEYA —',
      play_as_guest: 'Misafir Olarak Oyna',
      guest_create_account: 'Hesap Oluştur',
      guest_prompt_title: 'Misafir Modu',
      guest_shop_prompt: 'Öğeleri satın almak ve ilerlemenizi kaydetmek için lütfen bir hesap oluşturun!',
      guest_battlepass_prompt: 'Savaş Bileti ödüllerini almak ve ilerlemenizi kaydetmek için lütfen bir hesap oluşturun!',
      guest_login_required: 'Giriş yaparsan erişebilirsin',
      guest_login_required_desc: 'Bu sayfaya erişmek için giriş yapmalısınız.',
      guest_restricted_title: 'Giriş yaparsan erişebilirsin',
      guest_restricted_desc: 'Savaş Bileti, Mağaza ve Profil sayfalarına erişmek için giriş yapmanız gerekmektedir. Şimdi giriş yapın veya ücretsiz hesap oluşturun!',
      back_to_lobby: 'Lobiye Dön',

      // Common
      loading: 'Yükleniyor...',
      cancel: 'İptal',
      close: 'Kapat',
      save: 'Kaydet',
      copied: 'Kopyalandı!',
      link_copied: 'Bağlantı kopyalandı!',

      // Stats
      stat_w: 'G',
      stat_l: 'M',
      stat_d: 'B',
      stat_wins: 'Galibiyet',
      stat_losses: 'Mağlubiyet',
      stat_draws: 'Beraberlik',
      stat_win_rate: 'Kazanma Oranı',
      current_elo: 'Güncel ELO',
      welcome_back: 'Tekrar hoş geldin',

      // Login page
      login_heading: 'Tekrar Hoş Geldin',
      login_subtitle: 'MiniChess hesabınıza giriş yapın',
      username_label: 'Kullanıcı Adı',
      username_placeholder: 'Kullanıcı adınızı girin',
      password_label: 'Şifre',
      password_placeholder: 'Şifrenizi girin',
      login_btn: 'Oynamak İçin Giriş Yap',
      new_to_minichess: "MiniChess'te yeni misiniz?",
      badge_tactical_blitz: '6×6 Taktiksel Blitz',
      hero_tagline: 'Hızlı, Taktiksel Crazyhouse',
      hero_tagline_desc: 'Rakip taşları cebine topla, boş kareye indir ve hızlıca mat et.',
      ticker_duels: 'Tempolu Mini Satranç Düelloları',
      ticker_leaderboards: 'Küresel Liderlik Tablosunda Yüksel',
      ticker_bots: 'Gelişmiş Botlara Meydan Oku',
      ticker_customizations: 'Ayrıcalıklı Özelleştirmeleri Aç',

      // Register page
      register_heading: 'Hesap Oluştur',
      register_subtitle: "MiniChess'e katılın ve oynamaya başlayın",
      confirm_password_label: 'Şifreyi Onayla',
      confirm_password_placeholder: 'Şifrenizi onaylayın',
      register_btn: 'Hesap Oluştur',
      already_account: 'Zaten bir hesabınız var mı?',
      log_in: 'Giriş Yap',

      // Lobby
      hero_welcome_prefix: 'Tekrar hoş geldin,',
      hero_subtitle: 'Oyun modunu seç ve oynamaya başla',
      rejoin_game: 'Oyuna Geri Dön',
      game_in_progress: 'Devam Eden Oyun',
      tab_multiplayer: 'Çok Oyunculu',
      tab_vs_computer: 'Bilgisayara Karşı',
      tab_play_friend: 'Arkadaşla Oyna',
      mode_ranked_title: 'Dereceli 6x6',
      mode_ranked_desc: 'ELO puanı için rekabetçi çılgın ev satranç düellosu',
      mode_dice_title: 'Zarlı Mini Satranç',
      mode_dice_desc: 'Her turda hangi taşın hareket edeceğini belirlemek için zar at',
      find_match: 'Maç Bul',
      searching_opponent: 'Rakip Aranıyor...',
      in_queue: 'Sırada',
      cancel_queue: 'İptal',
      players_in_queue: 'sırada',
      online_players: 'çevrimiçi',
      bot_heading: 'Bilgisayara Karşı Alıştırma',
      bot_subtitle: 'Bir yapay zeka rakibi seç ve taktiklerini geliştir',
      filter_all: 'Tümü',
      filter_easy: 'Kolay',
      filter_medium: 'Orta',
      filter_hard: 'Zor',
      filter_expert: 'Usta',
      btn_play_bot: 'Bilgisayara Karşı Oyna',
      friend_heading: 'Bir Arkadaşınla Oyna',
      friend_subtitle: 'Özel bir oda oluştur veya arkadaşının oda kodunu gir',
      btn_create_room: 'Özel Oda Oluştur',
      waiting_friend: 'Arkadaşının katılması bekleniyor...',
      room_link_label: 'Bu bağlantıyı arkadaşınla paylaş:',
      copy_link_btn: 'Bağlantıyı Kopyala',
      or_join_room: 'VEYA BİR ODAYA KATIL',
      room_code_placeholder: 'Oda kodu veya bağlantı girin...',
      btn_join_room: 'Odaya Katıl',
      daily_quests: 'Günlük Görevler',
      top_players: 'En İyi Oyuncular',
      recent_activity: 'Son Aktiviteler',
      view_all: 'Tüm Liderlik Tablosunu Gör',
      view_battlepass: 'Savaş Biletini Gör',
      no_quests: 'Mevcut görev yok',
      no_activity: 'Henüz son aktivite yok',

      // Game
      your_pocket: 'Senin Cebin',
      opponents_pocket: 'Rakibin Cebi',
      moves: 'Hamleler',
      no_moves_yet: 'Henüz hamle yok',
      game_starting: 'Oyun başlıyor...',
      your_turn: 'Sıra Sende',
      opponents_turn: 'Rakibin Sırası',
      draw: 'Beraberlik',
      draw_offered: 'Beraberlik Teklif Edildi',
      resign: 'Pes Et',
      leave: 'Ayrıl',
      skip_turn: 'Pas Geç',
      roll: 'Zar',
      crazyhouse_pockets: 'Crazyhouse Cepleri',
      crazyhouse_desc: 'Ele geçirilen taşlar cebe girer. Taşları seçerek veya sürükleyerek boş karelere bırakabilirsiniz.',
      move_review: 'Hamle İncelemesi',
      move_review_desc: 'Oyunu incelemek için klavyedeki ← / → tuşlarını veya aşağıdaki butonları kullanın.',
      replay: 'Tekrar İzle',
      victory: 'ZAFER!',
      defeat: 'MAĞLUBİYET',
      game_draw: 'BERABERLİK',
      white_wins: 'Beyaz Kazandı!',
      black_wins: 'Siyah Kazandı!',
      play_again: 'Tekrar Oyna',
      back_to_lobby: 'Lobiye Dön',
      rematch: 'Rövanş',
      review_game: 'Oyunu İncele',
      check: 'Şah!',
      checkmate: 'Şah Mat!',
      stalemate: 'Pat!',
      draw_agreement: 'Anlaşmalı beraberlik',
      timeout: 'Süre bitti!',
      opponent_resigned: 'Rakip pes etti!',
      opponent_disconnected: 'Rakip bağlantısı kesildi',

      // Profile
      profile_title: 'Oyuncu Profili',
      profile_edit_avatar: 'Avatarı değiştirmek için tıklayın',
      member_since: 'Kayıt tarihi',
      stats_title: 'İstatistikler',
      game_history: 'Maç Geçmişi',
      achievements: 'Başarımlar',
      friends: 'Arkadaşlar',
      add_friend: 'Arkadaş Ekle',
      friend_username_placeholder: 'Kullanıcı adı girin...',
      send_request: 'İstek Gönder',
      pending: 'Bekleyen',
      pending_requests: 'Bekleyen İstekler',
      no_friends: 'Henüz arkadaş yok',
      no_history: 'Henüz maç oynanmadı',
      play_a_match: 'Maç Yap',
      accept: 'Kabul Et',
      decline: 'Reddet',
      remove: 'Çıkar',

      // Shop
      shop_title: 'Kozmetik Mağazası',
      shop_subtitle: 'Tahtanızı, galibiyet efektlerinizi ve oyuncu kartınızı özelleştirin',
      board_themes: 'Tahta Temaları',
      win_effects: 'Galibiyet Efektleri',
      name_colors: 'İsim Renkleri',
      buy: 'Satın Al',
      owned: 'Sahip Olunan',
      equipped: 'Kullanılıyor',
      equip: 'Kuşan',
      unequip: 'Çıkar',
      coins: 'Altın',
      free: 'Ücretsiz',

      // Battlepass
      battlepass_title: 'Savaş Bileti',
      season: 'Sezon',
      tier: 'Aşama',
      tiers: 'Aşamalar',
      current_tier: 'Mevcut Aşama',
      claim: 'Ödülü Al',
      claimed: 'Alındı',
      locked: 'Kilitli',
      unlocked: 'Açıldı',
      unlocked_titles: 'Kazanılan Unvanlar',

      // Leaderboard
      leaderboard_title: 'Küresel Liderlik Tablosu',
      leaderboard_subtitle: 'En yüksek sıralamalı MiniChess büyükustaları',
      rank: 'Sıra',
      player: 'Oyuncu',
      rating: 'Puan',

      // Additional UI & Lobby terms
      find_a_match: 'Maç Bul',
      cancel_search: 'Aramayı İptal Et',
      singleplayer_vs_computer: 'Tek Oyunculu — Bilgisayara Karşı',
      all_levels: 'Tüm Seviyeler',
      beginner: 'Başlangıç',
      intermediate: 'Orta Seviye',
      expert_master: 'Usta / Büyükusta',
      play_vs: 'Karşı Oyna',
      join_room_code: 'Oda Kodu ile Katıl',
      join_room_desc: 'Arkadaşının paylaştığı oda kodunu veya doğrudan bağlantıyı girerek odaya hemen katıl.',
      enter_room_code: 'Oda kodu veya bağlantı girin...',
      join: 'Katıl',
      create_private_room: 'Özel Oda Oluştur',
      create_room_desc: 'Yeni bir özel masa aç, oluşturulan davet bağlantısını arkadaşına gönder ve düelloya başla.',
      share_link_friend: 'Bu bağlantıyı arkadaşınla paylaş:',
      copy: 'Kopyala',
      cancel_room: 'Odayı İptal Et',
      daily_quests_battlepass: 'Günlük Görevler & Savaş Bileti',
      view_pass: 'Bileti Gör',
      full_board: 'Tam Liste',
      record: 'Sonuç',
      fast_tactical_grid: 'Hızlı Taktik Tahtası',
      fast_tactical_grid_desc: '6×6 Mini Tahta',
      dynamic_blitz: 'Dinamik Hızlı Satranç',
      increment_2_5: '2+5 Eklemeli Süre',
      deploy_captures: 'Cepten Taş Bırak',
      crazyhouse_drops: 'Crazyhouse Taş Bırakma',
      competitive_ladder: 'Rekabetçi Sıralama',
      ranked_elo: 'Dereceli ELO',
      how_minihouse_works: 'Minihouse Nasıl Çalışır:',
      minihouse_how_desc: 'Ele geçirilen taşlar cebe girer. Sıranız geldiğinde taş oynamak yerine cepten boş bir kareye taş bırakabilirsiniz!',
      community_feed: 'Topluluk Akışı',
      loading_activities: 'Canlı aktiviteler yükleniyor...',
      drop_master: 'Taş Bırakma Ustası',
      drop_master_desc: 'Tahtaya 4 ele geçirilmiş taş bırak',
      tactical_victory: 'Taktik Zafer',
      tactical_victory_desc: '2 dereceli çok oyunculu maç kazan',
      ai_warmup: 'Yapay Zeka Isınması',
      ai_warmup_desc: 'Herhangi bir bilgisayar botunu mat et',
      done: 'Tamamlandı',
      founders_season: 'Kurucular Sezonu',
      founders_season_desc: 'Maç yap, TP kazan ve özel unvanların kilidini aç. Her maç değerlidir!',
      your_titles: 'Unvanların',
      click_claim_title: '— Unvanını almak için Ödülü Al butonuna tıkla',
      no_titles_unlocked: 'Henüz hiç unvan kazanmadınız. Kazanmak için oynamaya devam edin!',
      loading_tiers: 'Aşamalar yükleniyor...',
      equipped_title: 'Kuşanılan Unvan:',
      none: 'Yok',
      loading_shop_items: 'Mağaza ürünleri yükleniyor...',
      no_items_category: 'Bu kategoride ürün bulunamadı.',
      // Sound & Mute Toggle
      sound: 'Ses',
      sound_toggle: 'Ses Efektleri',
      sound_muted: 'Ses Kapatıldı',
      sound_unmuted: 'Ses Açıldı',
      mute_sound: 'Sesi Kapat',
      unmute_sound: 'Sesi Aç',
      unmute: 'Sesi Aç',
      // Resign & Draw Modals
      resign_modal_title: 'Maçtan Çekil',
      resign_confirm_msg: 'Maçı pes etmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
      yes_resign: 'Evet, Pes Et',
      draw_modal_title: 'Beraberlik Teklif Et',
      draw_confirm_msg: 'Rakibinize beraberlik teklif etmek istediğinize emin misiniz?',
      yes_offer_draw: 'Evet, Beraberlik Teklif Et',
      draw_received_title: 'Beraberlik Teklifi',
      draw_received_msg: 'Rakibiniz beraberlik teklif etti. Kabul ediyor musunuz?',
      accept_draw: 'Kabul Et',
      decline_draw: 'Reddet',
      draw_cancelled: 'Beraberlik teklifi iptal edildi',
      draw_declined: 'Beraberlik teklifi reddedildi',
      draw_offered_waiting: 'Beraberlik teklif edildi — bekleniyor...',
      draw_cancelled_by_opponent: 'Beraberlik teklifi rakip tarafından iptal edildi',
      // Daily Quests
      quest_1_title: 'Bugün 1 Maç Tamamla',
      quest_1_desc: 'En az 1 maçı tamamla',
      quest_2_title: 'Cepten 2 Taş Bırak (Crazyhouse Drop)',
      quest_2_desc: 'Cepten tahtaya 2 adet taş yerleştir',
      quest_3_title: 'Bir Botu Mağlup Et',
      quest_3_desc: 'Herhangi bir yapay zeka botuna karşı galip gel',
      claim_reward: 'Ödülü Al',
      claim: 'Ödülü Al',
      claimed: 'Alındı',
      quest_completed: 'Görev Tamamlandı!',
      reward_claimed_toast: 'Battlepass XP eklendi!',
      // Live Matches & Spectator
      live_matches: 'Canlı Maçlar',
      live_matches_desc: 'Devam eden taktiksel maçları canlı izle',
      spectate: 'İzle',
      spectating_live: 'Canlı İzleniyor',
      spectators: 'izleyici',
      spectator_count: 'İzleyiciler',
      no_live_matches: 'Şu anda aktif maç bulunmuyor. Bir maç başlat ve ilk sen oyna!',
      spectator_mode: 'İzleyici Modu',
      spectator_banner_hint: 'Canlı izleyici modu — kontroller devre dışı',
      // Daily Streak
      daily_login_streak: '7 Günlük Giriş Serisi',
      daily_streak_sub: 'Her gün giriş yap, katlanan ödülleri topla!',
      claim_daily_reward: 'Giriş Ödülünü Al',
      streak_claimed_today: 'Bugün Alındı (Yarın Tekrar Gel)',
      streak_day: 'Gün',
      streak_bonus_claimed: 'Giriş ödülü alındı!',
      grand_prize: 'Büyük Ödül',
      streak_broken_notice: 'Bir gün kaçırıldığı için seriniz sıfırlandı.',
      coins: 'Altın',
      // Volume
      volume: 'Ses Seviyesi',
      volume_percent: 'Ses Seviyesi: %{0}',
      // Game additions & Spectator
      wins_suffix: 'Kazandı!',
      white_to_move: 'Beyazın Sırası',
      black_to_move: 'Siyahın Sırası',
      white_pocket: 'Beyazın Cebi',
      black_pocket: 'Siyahın Cebi',
      guest_streak_login_prompt: 'Günlük seriyi başlatmak ve ödülleri toplamak için lütfen bir hesap oluşturun!',
      streak_master: 'Seri Ustası',
      streak_master_desc: '7 günlük giriş serisini tamamla',
      badge: 'Rozet',
      // Achievements
      first_win: 'İlk Kan',
      first_win_desc: 'İlk galibiyetini al',
      fast_mate: 'Yıldırım Hızı',
      fast_mate_desc: '10 hamle veya daha kısa sürede kazan',
      bot_slayer: 'Bot Avcısı',
      bot_slayer_desc: 'Bir yapay zeka rakibi mağlup et',
      win_streak_10: 'Dokunulmaz',
      win_streak_10_desc: 'Üst üste 10 maç kazan',
      pacifist: 'Pasifist',
      pacifist_desc: 'Bir maçı beraberlikle bitir',
      dedicated_player: 'Sadık Oyuncu',
      dedicated_player_desc: '50 maç oyna',
      elo_1500: 'Yükselen Yıldız',
      elo_1500_desc: "1500 ELO'ya ulaş",
      elo_2000: 'Büyükusta',
      elo_2000_desc: "2000 ELO'ya ulaş",
      social_butterfly: 'Sosyal Kelebek',
      social_butterfly_desc: 'Bir arkadaş ekle',
      big_spender: 'Büyük Harcayıcı',
      big_spender_desc: 'Mağazadan bir eşya satın al',
      fashionista: 'Modacı',
      fashionista_desc: 'Profil avatarını değiştir',
      connecting_server: 'Sunucuya bağlanılıyor...',
      battlepass_xp: 'Savaş Bileti XP',
      btn_create_private_room: '+ Özel Oda Oluştur',
      variant: 'Varyant',
      top_players_desc: 'Küresel MiniChess Liderlik Tablosu',
      no_recent_activity: 'Henüz bir aktivite bulunmuyor',
      no_players_yet: 'Henüz oyuncu bulunmuyor. İlk sen ol!',
      failed_load_leaderboard: 'Liderlik tablosu yüklenemedi',
      failed_load_shop: 'Mağaza ürünleri yüklenemedi',
      join_private_game: 'Özel Oyuna Katıl',
      checking_room: 'Oda kontrol ediliyor...',
      no_tier_data: 'Aşama verisi bulunamadı.',
      empty_match_history_desc: 'Geçmiş maçlarını görmek için eşleşmeye katıl veya botlara meydan oku!',
      empty_friends_desc: 'Arkadaş edinmek için maç yap veya yukarıdan kullanıcı ara!',
      send_request_status: 'Gönderiliyor...',
      enter_username_status: 'Bir kullanıcı adı girin',
      confirm_remove_friend: 'Arkadaşı listenizden çıkarmak istediğinize emin misiniz?',
      time_control: 'Süre Kontrolü',
      bullet_1m: '1+0 Bullet (60s)',
      blitz_3m: '3+0 Blitz (180s)',
      rapid_5m: '5+0 Rapid (300s)',
      takeback: 'Geri Al',
      hint: 'İpucu',
      takeback_done: 'Hamle geri alındı',
      no_takeback_available: 'Geri alınacak hamle yok',
      calculating_hint: 'En iyi hamle hesaplanıyor...',
      hint_suggested: 'Öneri: ',
      copy_fen: 'FEN Kopyala',
      fen_copied: 'FEN panoya kopyalandı!',
      review_game: 'Hamleleri İncele',
      show_result: 'Sonucu Göster',
      game_finished_review: 'Maç Bitti — Hamle Gezgini',
      wait_your_turn: 'Sıranızı bekleyin',
      final_position: 'Son Konum',
      move_step: 'Hamle',
      only_bot_takeback: 'Geri alma sadece bot maçlarında kullanılabilir',
      only_bot_hint: 'İpucu sadece bot maçlarında kullanılabilir',
      failed_copy_fen: 'FEN kopyalanamadı',
      no_board_state: 'Geçerli tahta durumu bulunamadı',
      joining_game: 'Oyuna katılıyor...',
      room_has_two_players: 'Bu odada zaten iki oyuncu var.',
      no_room_id_provided: 'Oda kodu bulunamadı. Arkadaşınızdan doğru bağlantıyı isteyin.',
      room_check_failed: 'Oda kontrol edilemedi. Lütfen tekrar deneyin.',
      failed_create_room: 'Oda oluşturulamadı'
    }
  };

  let inMemoryLang = 'en';

  function getLang() {
    try {
      if (typeof window !== 'undefined' && window.location && window.location.search) {
        const urlParams = new URLSearchParams(window.location.search);
        const urlLang = urlParams.get('lang');
        if (urlLang === 'tr' || urlLang === 'en') {
          inMemoryLang = urlLang;
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, urlLang);
          }
          return urlLang;
        }
      }
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'tr' || saved === 'en') {
          inMemoryLang = saved;
          return saved;
        }
      }
    } catch (e) {}
    return inMemoryLang || 'en';
  }

  function setLanguage(lang) {
    if (lang !== 'tr' && lang !== 'en') lang = 'en';
    inMemoryLang = lang;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, lang);
      }
    } catch (e) {}

    if (typeof document !== 'undefined') {
      if (document.documentElement) {
        document.documentElement.lang = lang;
      }

      applyTranslations();
      updateToggleButtons();

      // Re-render guest elements if any
      const guestBadge = document.querySelectorAll('.guest-badge');
      guestBadge.forEach(el => {
        el.textContent = lang === 'tr' ? 'MİSAFİR' : 'GUEST';
      });

      const guestAccBtns = document.querySelectorAll('.guest-create-acc-btn');
      guestAccBtns.forEach(el => {
        const span = el.querySelector('span');
        if (span) {
          span.textContent = lang === 'tr' ? 'Hesap Oluştur' : 'Create Account';
        } else {
          el.textContent = lang === 'tr' ? 'Hesap Oluştur' : 'Create Account';
        }
      });
    }

    if (typeof window !== 'undefined') {
      // Notify listeners
      if (typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('minichess:lang', { detail: { lang } }));
      }

      if (window.renderGuestBadges && typeof window.renderGuestBadges === 'function') {
        window.renderGuestBadges();
      }
    }
  }

  // Canonical priority mappings to prevent reverse map collisions
  const CANONICAL_MAP = {
    'welcome back': 'welcome_back',
    'draw': 'draw',
    'cancel': 'cancel',
    'create account': 'create_account',
    'play': 'nav_play',
    'leaderboard': 'nav_leaderboard',
    'battlepass': 'nav_battlepass',
    'shop': 'nav_shop',
    'profile': 'nav_profile',
    'sign out': 'sign_out',
    'current elo': 'current_elo',
    'multiplayer': 'tab_multiplayer',
    'vs computer': 'tab_vs_computer',
    'play a friend': 'tab_play_friend',
    'find match': 'find_match',
    'find a match': 'find_a_match',
    'searching for opponent...': 'searching_opponent',
    'searching for opponent': 'searching_opponent',
    'daily quests': 'daily_quests',
    'top players': 'top_players',
    'recent activity': 'recent_activity',
    'your pocket': 'your_pocket',
    "opponent's pocket": 'opponents_pocket',
    'moves': 'moves',
    'no moves yet': 'no_moves_yet',
    'resign': 'resign',
    'leave': 'leave',
    'your turn': 'your_turn',
    "opponent's turn": 'opponents_turn',
    'wins': 'stat_wins',
    'losses': 'stat_losses',
    'draws': 'stat_draws',
    'win rate': 'stat_win_rate',
    'achievements': 'achievements',
    'friends': 'friends',
    'game history': 'game_history',
    'board themes': 'board_themes',
    'win effects': 'win_effects',
    'name colors': 'name_colors',
    'equipped': 'equipped',
    'owned': 'owned',
    'equip': 'equip',
    'unequip': 'unequip',
    'buy': 'buy',
    'coins': 'coins',
    'free': 'free',
    'sound': 'sound',
    'yes, resign': 'yes_resign',
    'claim': 'claim_reward'
  };

  const REVERSE_MAP = { ...CANONICAL_MAP };
  for (const [k, v] of Object.entries(TRANSLATIONS.en)) {
    if (typeof v === 'string') {
      const low = v.toLowerCase().trim();
      if (!REVERSE_MAP[low]) {
        REVERSE_MAP[low] = k;
      }
    }
  }

  function t(key, fallback) {
    if (!key) return '';
    const lang = getLang();
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
    if (dict && dict[key] !== undefined) {
      return dict[key];
    }
    const cleanKey = String(key).toLowerCase().trim();
    const mappedKey = REVERSE_MAP[cleanKey];
    if (mappedKey && dict && dict[mappedKey] !== undefined) {
      return dict[mappedKey];
    }
    const fallbackDict = TRANSLATIONS.en;
    if (fallbackDict && fallbackDict[key] !== undefined) {
      return fallbackDict[key];
    }
    return fallback !== undefined ? fallback : key;
  }

  function applyTranslations(root) {
    const scope = root || document;
    const elements = scope.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const text = t(key);

      // Check if element has an icon or children
      if (el.children.length === 0) {
        el.textContent = text;
      } else {
        // Find text node child or replace text while preserving icons
        let replaced = false;
        for (let i = 0; i < el.childNodes.length; i++) {
          if (el.childNodes[i].nodeType === Node.TEXT_NODE && el.childNodes[i].textContent.trim().length > 0) {
            el.childNodes[i].textContent = ' ' + text;
            replaced = true;
            break;
          }
        }
        if (!replaced) {
          // If no text node was found, check for span.btn-text or append
          const textSpan = el.querySelector('.btn-text, .i18n-text, .nav-text');
          if (textSpan) {
            textSpan.textContent = text;
          }
        }
      }
    });

    // Placeholders
    const placeholders = scope.querySelectorAll('[data-i18n-placeholder], [data-i18n-ph]');
    placeholders.forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder') || el.getAttribute('data-i18n-ph');
      if (key) el.setAttribute('placeholder', t(key));
    });

    // Titles
    const titles = scope.querySelectorAll('[data-i18n-title]');
    titles.forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key) el.setAttribute('title', t(key));
    });
  }

  function updateToggleButtons() {
    const current = getLang();
    document.querySelectorAll('.lang-btn').forEach(btn => {
      const btnLang = btn.getAttribute('data-lang');
      if (btnLang === current) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function getToggleMarkup() {
    const current = getLang();
    return `
      <div class="lang-toggle" role="group" aria-label="Language Selector">
        <span class="lang-globe-icon">🌐</span>
        <button type="button" class="lang-btn ${current === 'tr' ? 'active' : ''}" data-lang="tr" onclick="setLanguage('tr')">TR</button>
        <span class="lang-sep">|</span>
        <button type="button" class="lang-btn ${current === 'en' ? 'active' : ''}" data-lang="en" onclick="setLanguage('en')">EN</button>
      </div>
    `;
  }

  function renderLanguageToggle(containerId) {
    if (containerId) {
      const target = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
      if (target) {
        target.innerHTML = getToggleMarkup();
      }
    } else {
      initLanguageUI();
    }
  }

  function initLanguageUI() {
    // Top-right toggle (on index.html / register.html)
    const topSlot = document.getElementById('langToggleTop');
    if (topSlot) {
      topSlot.innerHTML = getToggleMarkup();
    }

    // Sidebar toggle (above user profile in all dashboard pages)
    const sidebarSlot = document.getElementById('sidebarLangContainer');
    if (sidebarSlot) {
      sidebarSlot.innerHTML = getToggleMarkup();
    }

    applyTranslations();
    updateToggleButtons();

    if (window.renderGuestBadges && typeof window.renderGuestBadges === 'function') {
      window.renderGuestBadges();
    }
  }

  // Export globally
  if (typeof window !== 'undefined') {
    window.getLang = getLang;
    window.setLanguage = setLanguage;
    window.t = t;
    window.applyTranslations = applyTranslations;
    window.initLanguageUI = initLanguageUI;
    window.renderLanguageToggle = renderLanguageToggle;
    window.getToggleMarkup = getToggleMarkup;
    window.TRANSLATIONS = TRANSLATIONS;

    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLanguageUI);
      } else {
        initLanguageUI();
      }
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      getLang,
      setLanguage,
      t,
      applyTranslations,
      TRANSLATIONS,
      CANONICAL_MAP
    };
  }
})();
