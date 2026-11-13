<!---

---
title: "CASA0017: Web Architecture Final Assessment"
author: "Steven Gray, Valerio Signorelli, Duncan Wilson, Sarah Wise"
date: "10 Dec 2020"
---

-->

# Find a Place

Team Name: Chinese can fly  
Team authors: Qingshan Zhang, Anthony Xie, Monong Yang, Jinhao Zhong

## *Abstract*

*“Find a Place” is a website that helps a group of people living in different parts of London decide where to meet. Users enter between two and six postcodes and choose a venue type. The site locates the midpoint of the group and selects nearby venues from a database built on OpenStreetMap. It then uses the Transport for London Unified API to plan each person's journey. Any venue that someone cannot reach is removed. The front end and the Node.js back end were developed separately, then integrated and refined. The result is a simple, map-based tool that gives a group a shared starting point for choosing a place. Future work would rank venues by travel time instead of distance, making the suggestions fairer.*


## 1. Introduction

### 1.1 Background and Problem

People who study or work together in London often live far apart. For example, the four members of our group live in different areas of the city, and whenever we want to meet up off campus, we run into the same small but persistent question of where to go. Each of us is familiar with the area near where we live but knows little about somewhere we do not visit often. Hence, it is hard to judge whether a suggestion suits everyone. In practice the choice is often made by whoever speaks first, and someone else ends up with a much longer journey. This everyday experience reflects a wider finding in transport research. Public transport accessibility in London is unevenly distributed. It is highest in the centre and along the main radial corridors, and lower elsewhere (Nie et al., 2024). The same destination can therefore be easy to reach for one person and difficult for another.

Two existing products shaped our thinking. Google Maps and Apple Maps are widely used journey planners, and during development we treated both as models of good design, with a map that fills the screen, a simple search panel, and clear routes drawn on the map (Google, 2026; Apple, 2026). However, both are built around one person travelling to a place that has already been chosen. They do not suggest a place for a group.

This gap led to the idea behind Find a Place, a website that takes each person's starting point and suggests a suitable place to meet between them, such as a restaurant, café, library, park or pub. The idea came first and the data came later. Once a consensus on the issue was reached, we began looking for data to substantiate it. We found that the Transport for London (TfL) Unified API provides journey plans across the public transport network (Transport for London, 2026). This made it possible to show each person's real journey, not just a straight-line distance.

### 1.2 Research Topic and Aims

The research topic of this project is how a group of people living in different parts of London can find a place to meet that sits between all of them and that every member can realistically reach. It asks a simple question: Given where everyone is starting from, where is a sensible place to meet, and how would each person get there?

The website has three aims. Firstly, it should find a meeting place in the middle of the group. It does this by locating the midpoint of everyone's starting points, selecting real venues close to it, and checking that every member can reach them. Secondly, the interface should be clean, clear and easy to understand. Find a Place is a practical tool, so the design avoids decoration that does not help the user complete the task. Thirdly, the site should be carefully built in its details and coherent as a whole. For instance, in how it responds to an invalid postcode or shows that results are loading.

The following sections explain how these aims were met, in the order the site was built, integrated and refined.

## 2.



## 7. Conclusion

### 7.1 Evaluation

Find a Place met its three aims to different degrees. The first was met in a basic form. The site finds the midpoint of a group, suggests real venues near it and removes any that a member cannot reach by public transport. The second was met. The interface is a single page with a full-screen map and a short input panel, and a group gets a result in a few steps. The third was largely met, with clear messages for invalid postcodes and a visible loading state.

### 7.2 Limitations

The main limitation is the midpoint itself. A geometric midpoint is not always the fairest point to travel to, for example when a group is split by the river or served by uneven transport lines. Venues are searched only within 3 km of the midpoint and ranked by straight-line distance, not by travel time. Each search calls the TfL API once per person per venue, up to 48 times, which is slow. The site covers only London, and only public transport and walking. Opening hours are stored but not used to filter results, and the OpenStreetMap venue data is a one-off snapshot of uneven completeness.

### 7.3 Future Work

With more time, the top priority would be the algorithm. Venues could be ranked by travel time, by minimising either the longest journey in the group or the difference between journeys, which would bring the site closer to a fair result. TfL results could be cached to speed up searches, and each person's travel time could be shown on the venue cards. Users could also choose a departure time and travel mode. A place name search could be added alongside postcode entry to enhance the user experience. The venue data could be refreshed regularly. The interface is already simple, so new features would be added only where they are clearly needed. If the site works well, it could be extended from London to the rest of the UK.


## Bibliography

1. Apple (2026). Apple Maps. <https://www.apple.com/maps/> [Accessed 13 Nov. 2026].

2. Google (2026). Google Maps. <https://www.google.com/maps> [Accessed 13 Nov. 2026].

3. Nie, Y., Bhatnagar, S., Smith, D. and Suel, E. (2024). Disparities in public transport accessibility in London from 2011 to 2021. *Computers, Environment and Urban Systems*, 113, 102169. <https://doi.org/10.1016/j.compenvurbsys.2024.102169>

4. Transport for London (2026). Unified API. <https://tfl.gov.uk/info-for/open-data-users/unified-api> [Accessed 13 Nov. 2026].


----

## Declaration of Authorship

We, Qingshan Zhang, Anthony Xie, Monong Yang, Jinhao Zhong, confirm that the work presented in this assessment is our own. Where information has been derived from other sources, I confirm that this has been indicated in the work.


Digitally Sign with Your name Here

ASSESSMENT DATE 13/Nov/2026
