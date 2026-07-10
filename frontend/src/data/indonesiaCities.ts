// Daftar kota + kabupaten se-Indonesia (38 provinsi) untuk saran datalist form register.
// Nama memakai bentuk ringkas (tanpa awalan "Kota"/"Kabupaten"). Untuk Kalimantan & Sulawesi
// (pasar inti) ditambahkan alias kota ibukota kabupaten yang lebih dikenal (mis. Sampit, Tenggarong).
// Field tetap free-text — ini hanya bantuan pengetikan.

export const INDONESIA_CITIES: string[] = [
  // ── Aceh ──
  'Banda Aceh', 'Sabang', 'Langsa', 'Lhokseumawe', 'Subulussalam', 'Aceh Besar', 'Pidie', 'Pidie Jaya',
  'Bireuen', 'Aceh Utara', 'Aceh Timur', 'Aceh Tamiang', 'Bener Meriah', 'Aceh Tengah', 'Gayo Lues',
  'Aceh Tenggara', 'Aceh Barat', 'Nagan Raya', 'Aceh Barat Daya', 'Aceh Selatan', 'Aceh Singkil', 'Simeulue', 'Aceh Jaya',
  // ── Sumatera Utara ──
  'Medan', 'Binjai', 'Tebing Tinggi', 'Pematangsiantar', 'Tanjungbalai', 'Sibolga', 'Padang Sidempuan', 'Gunungsitoli',
  'Deli Serdang', 'Serdang Bedagai', 'Langkat', 'Karo', 'Simalungun', 'Asahan', 'Batu Bara', 'Labuhanbatu',
  'Labuhanbatu Utara', 'Labuhanbatu Selatan', 'Toba', 'Samosir', 'Dairi', 'Pakpak Bharat', 'Humbang Hasundutan',
  'Tapanuli Utara', 'Tapanuli Tengah', 'Tapanuli Selatan', 'Padang Lawas', 'Padang Lawas Utara', 'Mandailing Natal',
  'Nias', 'Nias Utara', 'Nias Barat', 'Nias Selatan',
  // ── Sumatera Barat ──
  'Padang', 'Bukittinggi', 'Padang Panjang', 'Payakumbuh', 'Sawahlunto', 'Solok', 'Pariaman', 'Agam', 'Pasaman',
  'Pasaman Barat', 'Lima Puluh Kota', 'Tanah Datar', 'Padang Pariaman', 'Pesisir Selatan', 'Solok Selatan',
  'Sijunjung', 'Dharmasraya', 'Kepulauan Mentawai',
  // ── Riau ──
  'Pekanbaru', 'Dumai', 'Kampar', 'Rokan Hulu', 'Rokan Hilir', 'Bengkalis', 'Siak', 'Pelalawan',
  'Indragiri Hulu', 'Indragiri Hilir', 'Kuantan Singingi', 'Kepulauan Meranti',
  // ── Kepulauan Riau ──
  'Tanjungpinang', 'Batam', 'Bintan', 'Karimun', 'Lingga', 'Natuna', 'Kepulauan Anambas',
  // ── Jambi ──
  'Jambi', 'Sungai Penuh', 'Muaro Jambi', 'Batanghari', 'Tebo', 'Bungo', 'Tanjung Jabung Barat',
  'Tanjung Jabung Timur', 'Sarolangun', 'Merangin', 'Kerinci',
  // ── Sumatera Selatan ──
  'Palembang', 'Prabumulih', 'Lubuklinggau', 'Pagar Alam', 'Ogan Komering Ulu', 'OKU Timur', 'OKU Selatan',
  'Ogan Komering Ilir', 'Ogan Ilir', 'Muara Enim', 'Lahat', 'Musi Rawas', 'Musi Rawas Utara', 'Musi Banyuasin',
  'Banyuasin', 'Empat Lawang', 'Penukal Abab Lematang Ilir',
  // ── Kepulauan Bangka Belitung ──
  'Pangkalpinang', 'Bangka', 'Bangka Barat', 'Bangka Tengah', 'Bangka Selatan', 'Belitung', 'Belitung Timur',
  // ── Bengkulu ──
  'Bengkulu', 'Rejang Lebong', 'Kepahiang', 'Lebong', 'Bengkulu Utara', 'Bengkulu Tengah', 'Bengkulu Selatan',
  'Kaur', 'Seluma', 'Mukomuko',
  // ── Lampung ──
  'Bandar Lampung', 'Metro', 'Lampung Selatan', 'Lampung Tengah', 'Lampung Utara', 'Lampung Timur', 'Lampung Barat',
  'Tanggamus', 'Tulang Bawang', 'Tulang Bawang Barat', 'Way Kanan', 'Pesawaran', 'Pringsewu', 'Mesuji', 'Pesisir Barat',
  // ── Banten ──
  'Serang', 'Cilegon', 'Tangerang', 'Tangerang Selatan', 'Lebak', 'Pandeglang',
  // ── DKI Jakarta ──
  'Jakarta Pusat', 'Jakarta Utara', 'Jakarta Barat', 'Jakarta Selatan', 'Jakarta Timur', 'Kepulauan Seribu',
  // ── Jawa Barat ──
  'Bandung', 'Bandung Barat', 'Bekasi', 'Bogor', 'Depok', 'Cimahi', 'Sukabumi', 'Cirebon', 'Tasikmalaya', 'Banjar',
  'Garut', 'Cianjur', 'Kuningan', 'Majalengka', 'Sumedang', 'Indramayu', 'Subang', 'Purwakarta', 'Karawang',
  'Ciamis', 'Pangandaran',
  // ── Jawa Tengah ──
  'Semarang', 'Surakarta', 'Solo', 'Salatiga', 'Magelang', 'Pekalongan', 'Tegal', 'Demak', 'Kendal', 'Batang',
  'Pemalang', 'Brebes', 'Pati', 'Kudus', 'Jepara', 'Rembang', 'Blora', 'Grobogan', 'Sragen', 'Karanganyar',
  'Wonogiri', 'Sukoharjo', 'Klaten', 'Boyolali', 'Temanggung', 'Wonosobo', 'Purworejo', 'Kebumen', 'Banjarnegara',
  'Purbalingga', 'Banyumas', 'Cilacap',
  // ── DI Yogyakarta ──
  'Yogyakarta', 'Sleman', 'Bantul', 'Kulon Progo', 'Gunungkidul',
  // ── Jawa Timur ──
  'Surabaya', 'Malang', 'Kediri', 'Blitar', 'Madiun', 'Mojokerto', 'Pasuruan', 'Probolinggo', 'Batu', 'Sidoarjo',
  'Gresik', 'Lamongan', 'Bojonegoro', 'Tuban', 'Jombang', 'Nganjuk', 'Ngawi', 'Magetan', 'Ponorogo', 'Pacitan',
  'Trenggalek', 'Tulungagung', 'Lumajang', 'Jember', 'Bondowoso', 'Situbondo', 'Banyuwangi', 'Bangkalan',
  'Sampang', 'Pamekasan', 'Sumenep',
  // ── Bali ──
  'Denpasar', 'Badung', 'Gianyar', 'Tabanan', 'Klungkung', 'Bangli', 'Karangasem', 'Buleleng', 'Jembrana',
  // ── Nusa Tenggara Barat ──
  'Mataram', 'Bima', 'Lombok Barat', 'Lombok Tengah', 'Lombok Timur', 'Lombok Utara', 'Sumbawa', 'Sumbawa Barat', 'Dompu',
  // ── Nusa Tenggara Timur ──
  'Kupang', 'Timor Tengah Selatan', 'Timor Tengah Utara', 'Belu', 'Malaka', 'Alor', 'Lembata', 'Flores Timur',
  'Sikka', 'Ende', 'Ngada', 'Nagekeo', 'Manggarai', 'Manggarai Barat', 'Manggarai Timur', 'Sumba Timur',
  'Sumba Barat', 'Sumba Barat Daya', 'Sumba Tengah', 'Rote Ndao', 'Sabu Raijua',
  // ── Kalimantan Barat ──
  'Pontianak', 'Singkawang', 'Kubu Raya', 'Mempawah', 'Sambas', 'Bengkayang', 'Landak', 'Sanggau', 'Sekadau',
  'Sintang', 'Melawi', 'Kapuas Hulu', 'Ketapang', 'Kayong Utara',
  // ── Kalimantan Tengah ──
  'Palangka Raya', 'Kotawaringin Barat', 'Pangkalan Bun', 'Kotawaringin Timur', 'Sampit', 'Seruyan', 'Sukamara',
  'Lamandau', 'Katingan', 'Gunung Mas', 'Pulang Pisau', 'Kapuas', 'Barito Selatan', 'Barito Timur', 'Barito Utara', 'Murung Raya',
  // ── Kalimantan Selatan ──
  'Banjarmasin', 'Banjarbaru', 'Banjar', 'Martapura', 'Barito Kuala', 'Tapin', 'Hulu Sungai Selatan',
  'Hulu Sungai Tengah', 'Hulu Sungai Utara', 'Balangan', 'Tabalong', 'Tanah Laut', 'Pelaihari', 'Tanah Bumbu', 'Kotabaru',
  // ── Kalimantan Timur ──
  'Samarinda', 'Balikpapan', 'Bontang', 'Kutai Kartanegara', 'Tenggarong', 'Kutai Barat', 'Kutai Timur', 'Sangatta',
  'Berau', 'Tanjung Redeb', 'Paser', 'Penajam Paser Utara', 'Penajam', 'Mahakam Ulu',
  // ── Kalimantan Utara ──
  'Tarakan', 'Bulungan', 'Tanjung Selor', 'Malinau', 'Nunukan', 'Tana Tidung',
  // ── Sulawesi Utara ──
  'Manado', 'Bitung', 'Tomohon', 'Kotamobagu', 'Minahasa', 'Minahasa Utara', 'Minahasa Selatan', 'Minahasa Tenggara',
  'Bolaang Mongondow', 'Bolaang Mongondow Utara', 'Bolaang Mongondow Selatan', 'Bolaang Mongondow Timur',
  'Kepulauan Sangihe', 'Kepulauan Talaud', 'Kepulauan Siau Tagulandang Biaro',
  // ── Sulawesi Tengah ──
  'Palu', 'Donggala', 'Sigi', 'Parigi Moutong', 'Poso', 'Tojo Una-Una', 'Morowali', 'Morowali Utara',
  'Banggai', 'Luwuk', 'Banggai Kepulauan', 'Banggai Laut', 'Tolitoli', 'Buol',
  // ── Sulawesi Selatan ──
  'Makassar', 'Parepare', 'Palopo', 'Gowa', 'Maros', 'Takalar', 'Jeneponto', 'Bantaeng', 'Bulukumba', 'Sinjai',
  'Bone', 'Watampone', 'Soppeng', 'Wajo', 'Sidenreng Rappang', 'Pinrang', 'Enrekang', 'Luwu', 'Luwu Utara',
  'Luwu Timur', 'Tana Toraja', 'Toraja Utara', 'Pangkajene dan Kepulauan', 'Barru', 'Kepulauan Selayar',
  // ── Sulawesi Tenggara ──
  'Kendari', 'Baubau', 'Konawe', 'Konawe Selatan', 'Konawe Utara', 'Konawe Kepulauan', 'Kolaka', 'Kolaka Utara',
  'Kolaka Timur', 'Bombana', 'Buton', 'Buton Utara', 'Buton Tengah', 'Buton Selatan', 'Muna', 'Muna Barat', 'Wakatobi',
  // ── Gorontalo ──
  'Gorontalo', 'Gorontalo Utara', 'Boalemo', 'Pohuwato', 'Bone Bolango',
  // ── Sulawesi Barat ──
  'Mamuju', 'Mamuju Tengah', 'Pasangkayu', 'Majene', 'Polewali Mandar', 'Mamasa',
  // ── Maluku ──
  'Ambon', 'Tual', 'Maluku Tengah', 'Maluku Tenggara', 'Kepulauan Tanimbar', 'Kepulauan Aru', 'Seram Bagian Barat',
  'Seram Bagian Timur', 'Buru', 'Buru Selatan', 'Maluku Barat Daya',
  // ── Maluku Utara ──
  'Ternate', 'Tidore Kepulauan', 'Halmahera Barat', 'Halmahera Tengah', 'Halmahera Utara', 'Halmahera Selatan',
  'Halmahera Timur', 'Kepulauan Sula', 'Pulau Morotai', 'Pulau Taliabu',
  // ── Papua ──
  'Jayapura', 'Keerom', 'Sarmi', 'Mamberamo Raya', 'Biak Numfor', 'Kepulauan Yapen', 'Waropen', 'Supiori',
  // ── Papua Tengah ──
  'Nabire', 'Mimika', 'Timika', 'Paniai', 'Dogiyai', 'Deiyai', 'Intan Jaya', 'Puncak', 'Puncak Jaya',
  // ── Papua Pegunungan ──
  'Jayawijaya', 'Wamena', 'Lanny Jaya', 'Nduga', 'Tolikara', 'Yalimo', 'Mamberamo Tengah', 'Yahukimo',
  'Pegunungan Bintang',
  // ── Papua Selatan ──
  'Merauke', 'Boven Digoel', 'Mappi', 'Asmat',
  // ── Papua Barat ──
  'Manokwari', 'Manokwari Selatan', 'Pegunungan Arfak', 'Teluk Bintuni', 'Teluk Wondama', 'Fakfak', 'Kaimana',
  // ── Papua Barat Daya ──
  'Sorong', 'Sorong Selatan', 'Raja Ampat', 'Tambrauw', 'Maybrat',
]
