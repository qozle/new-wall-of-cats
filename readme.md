This is a remake of an [old project I made in 2020 with the same name](https://github.com/qozle/wall-of-cats).  The old project used Vue, and was also pretty sloppy (and used spaces and not tabs, yuck).  It used an SQL 'watcher', that would watch an SQL database for changes (data pushed from the twitter API), and had a callback for then sending the data via WSS to the client, which Vue would handle.

I didn't like that I used Vue.  I think Vue is pretty cool, but this is a very small project, and all the infrastructure just made for more of a headache.  To make the project more accessible in general, and easier to manage, I decided to just use jquery.  Because really it only needs a few lines of code, instead of the giant scaffolding that came with Vue.

I also go rid of the SQL watcher.  It's not necessary.  I'm not even sure why I put it in there- probably because I had never seen something like it, and thought it was cool.

This version has taken me substantially less time to make and is also much more organized, and I hope serves the purpose of being an up-to-date indicator of my programming skills.

You can see the live demo version of this at [https://01014.org/new-wall-of-cats](https://01014.org/new-wall-of-cats).

(NOTE:  the project may currently be down due to very recent server migration and maintenance.)

